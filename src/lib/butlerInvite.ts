import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ensureFinanceTables } from "@/lib/finance";
import { BUTLER_GRADES, gradePay, isButlerGrade } from "@/lib/financeCalc";
import { resolveDeskSide, won } from "@/lib/pricing";
import { pad2 } from "@/lib/format";
import { homepageUrl } from "@/lib/records";
import { sendButlerInviteAlimtalk } from "@/lib/alimtalk";
import { sendAssignKakaoWorkNotice } from "@/lib/kakaowork";
import { createAssignment } from "@/lib/assign";
import { notifyAssignCompleteIfFull } from "@/lib/assignComplete";
import { cut, workStartLabel } from "@/lib/butlerNotice";

// 버틀러 참석 문의 (2026-11-23). 관리자가 예약 1건에 대해 등급·담당 쪽·모집 인원(need)을 정하고 후보 버틀러에게 링크를 보내면,
// 후보는 홈페이지 /b/<token> 에서 참석/불참을 누른다. 같은 문의(batchId)에서 먼저 참석을 누른 need명이 배정(ButlerShift)으로 확정되고
// 나머지 후보의 링크는 마감된다. 응답 기한은 발송 후 24시간(예식일이 더 가까우면 예식일 끝까지).
// 확정되면 createAssignment 로 배정을 만들므로 정산·손익에 그대로 들어간다. 확정 후 변경은 관리자가 배정 화면에서 한다.

export const INVITE_HOURS = 24;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const DDL = [
  `CREATE TABLE IF NOT EXISTS "ButlerInvite" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "butlerId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "side" TEXT NOT NULL DEFAULT '',
    "need" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ButlerInvite_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ButlerInvite_token_key" ON "ButlerInvite"("token")`,
  `CREATE INDEX IF NOT EXISTS "ButlerInvite_reservationId_idx" ON "ButlerInvite"("reservationId")`,
];

let ready: Promise<void> | null = null;
export function ensureInviteTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const stmt of DDL) await prisma.$executeRawUnsafe(stmt);
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

export type InviteState = "pending" | "accepted" | "declined" | "closed" | "cancelled" | "expired" | "wait" | "not_found";

/** 만료 시각: 지금부터 24시간, 예식일이 더 가까우면 예식일 밤 12시(한국)까지 */
export function inviteExpiry(now: Date, weddingDate: string): Date {
  const limit = new Date(now.getTime() + INVITE_HOURS * 3600_000);
  const end = new Date(`${weddingDate}T23:59:59+09:00`);
  return end.getTime() < limit.getTime() ? end : limit;
}

/** 화면에 보여 줄 상태. 대기 중인데 기한이 지났으면 만료로 본다. */
export function inviteState(o: { status: string; expiresAt: Date }, now = new Date()): InviteState {
  if (o.status === "pending") return o.expiresAt.getTime() <= now.getTime() ? "expired" : "pending";
  return o.status as InviteState;
}

/** 이 버틀러가 참석 문의로 확정된 배정인지 (이 경우 기존 업무 배정 알림톡을 보내지 않는다) */
export async function viaInvite(reservationId: string, butlerId: string): Promise<boolean> {
  await ensureInviteTable();
  return (await prisma.butlerInvite.count({ where: { reservationId, butlerId, status: "accepted" } })) > 0;
}

const TOKEN = /^[0-9a-f]{32}$/;
const kst = (d: Date) => new Date(d.getTime() + 9 * 3600_000);
function deadlineLabel(d: Date): string {
  const k = kst(d);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${pad2(k.getUTCHours())}:${pad2(k.getUTCMinutes())}`;
}
function dateOnly(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}.${pad2(m)}.${pad2(d)} (${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}
const sideText = (invSide: string, resSide: string) => invSide || (resSide === "신랑측" || resSide === "신부측" ? resSide : "추후 안내");
const inviteUrl = (token: string) => `${homepageUrl()}/b/${token}`;

export interface InviteInfo {
  name: string;
  gradeLabel: string;
  date: string;
  time: string;
  venue: string;
  side: string;
  start: string;
  pay: string;
  deadline: string;
}

async function infoOf(inv: { reservationId: string; butlerId: string; grade: string; side: string; expiresAt: Date }): Promise<InviteInfo | null> {
  const [r, butler] = await Promise.all([
    prisma.reservation.findUnique({ where: { id: inv.reservationId }, select: { confirmDate: true, confirmTime: true, confirmVenue: true, venueLabel: true, side: true } }),
    prisma.butler.findUnique({ where: { id: inv.butlerId }, select: { name: true } }),
  ]);
  if (!r || !butler) return null;
  return {
    name: butler.name,
    gradeLabel: isButlerGrade(inv.grade) ? BUTLER_GRADES[inv.grade].label : inv.grade,
    date: dateOnly(r.confirmDate),
    time: /^\d{1,2}:\d{2}$/.test(r.confirmTime) ? r.confirmTime : "시간 미정",
    venue: cut(r.confirmVenue || r.venueLabel),
    side: cut(sideText(inv.side, r.side)),
    start: /^\d{1,2}:\d{2}$/.test(r.confirmTime) ? `${workStartLabel(r.confirmTime)}까지 도착` : "추후 안내", // 예식 1시간 전까지 도착
    pay: won(gradePay(inv.grade, butler.name)),
    deadline: deadlineLabel(inv.expiresAt),
  };
}

/** 홈페이지 /b/<token> 이 보여 줄 정보. 대기·확정 상태일 때만 예식 정보를 준다. */
export async function getInviteView(token: string): Promise<{ state: InviteState; info?: InviteInfo }> {
  if (!TOKEN.test(token)) return { state: "not_found" };
  await ensureInviteTable();
  const inv = await prisma.butlerInvite.findUnique({ where: { token } });
  if (!inv) return { state: "not_found" };
  let state = inviteState(inv);
  if (state === "pending") {
    const r = await prisma.reservation.findUnique({ where: { id: inv.reservationId }, select: { status: true } });
    if (!r || r.status === "취소") state = "cancelled";
  }
  const info = state === "pending" || state === "accepted" ? await infoOf(inv) : null;
  return info ? { state, info } : { state };
}

function messageParts(info: InviteInfo, token: string) {
  const variables = {
    "#{name}": info.name,
    "#{date}": info.date,
    "#{time}": info.time,
    "#{venue}": info.venue,
    "#{side}": info.side,
    "#{start}": info.start,
    "#{pay}": info.pay,
    "#{deadline}": info.deadline,
    "#{url}": inviteUrl(token).replace(/^https?:\/\//, ""), // 버튼 링크가 http://#{url} 이라 스킴을 뺀다
  };
  const text = [
    "[웨딩버틀러] 참석 가능 여부를 알려주세요",
    "",
    `${info.name} 버틀러님, 아래 예식에 참석이 가능하신지 확인 부탁드립니다.`,
    "",
    `일시: ${info.date} ${info.time}`,
    `장소: ${info.venue}`,
    `담당: ${info.side}`,
    `근무 시작: ${info.start}`,
    `정산금: ${info.pay}`,
    "",
    `선착순으로 확정되며, ${info.deadline}까지 응답해 주세요.`,
    inviteUrl(token),
  ].join("\n");
  return { variables, text };
}

/** 문의 한 건을 보낸다 (알림톡, 실패하면 솔라피가 문자로 대신). */
async function sendInvite(id: string): Promise<{ sent: boolean; detail: string }> {
  const inv = await prisma.butlerInvite.findUnique({ where: { id } });
  if (!inv) return { sent: false, detail: "문의 없음" };
  const butler = await prisma.butler.findUnique({ where: { id: inv.butlerId } });
  const info = await infoOf(inv);
  if (!butler || !info) return { sent: false, detail: "정보 없음" };
  if (!butler.phone) return { sent: false, detail: "휴대폰 번호 미등록" };
  const { variables, text } = messageParts(info, inv.token);
  const res = await sendButlerInviteAlimtalk(inv.reservationId, inv.butlerId, butler.phone, variables, text);
  if (res.sent) await prisma.butlerInvite.update({ where: { id }, data: { sentAt: new Date() } });
  return res;
}

export interface CreateInput { reservationId: string; grade: string; side: string; need: number; butlerIds: string[] }

/** 후보 버틀러들에게 참석 문의를 만들어 보낸다. 화면에 띄울 결과 문구를 돌려준다. */
export async function createInvites(input: CreateInput): Promise<string> {
  await ensureFinanceTables();
  await ensureInviteTable();
  const { reservationId, grade, butlerIds } = input;
  if (!isButlerGrade(grade)) throw new Error("등급을 확인해 주세요.");
  const need = Math.floor(input.need);
  if (!(need >= 1)) throw new Error("모집 인원을 확인해 주세요.");
  if (!butlerIds.length) throw new Error("문의할 버틀러를 골라 주세요.");
  const r = await prisma.reservation.findUnique({ where: { id: reservationId }, select: { status: true, confirmDate: true, side: true, confirmPlan: true, confirmButlers: true } });
  if (!r) throw new Error("예약을 찾을 수 없습니다.");
  if (r.status === "취소") throw new Error("취소된 예약에는 문의할 수 없습니다.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.confirmDate)) throw new Error("예식 날짜가 정해진 뒤에 문의할 수 있습니다.");
  const side = resolveDeskSide(r.side, r.confirmPlan, input.side);
  const [shifts, pendingBatch] = await Promise.all([
    prisma.butlerShift.findMany({ where: { reservationId }, select: { butlerId: true, grade: true } }),
    prisma.butlerInvite.findMany({ where: { reservationId, status: "pending", expiresAt: { gt: new Date() } }, select: { butlerId: true } }),
  ]);
  if (need > r.confirmButlers - shifts.length) throw new Error(`남은 자리(${Math.max(0, r.confirmButlers - shifts.length)}명)보다 많이 모집할 수 없습니다.`);
  if (grade !== "owner" && !shifts.some((s) => s.grade === "owner")) throw new Error("오너 버틀러가 배정된 뒤에 스태프·매니저에게 문의할 수 있습니다.");
  const butlers = await prisma.butler.findMany({ where: { id: { in: butlerIds } } });
  const skipped: string[] = [];
  const targets = butlers.filter((b) => {
    if (shifts.some((s) => s.butlerId === b.id)) { skipped.push(`${b.name}(이미 배정됨)`); return false; }
    if (pendingBatch.some((p) => p.butlerId === b.id)) { skipped.push(`${b.name}(응답 대기 중인 문의 있음)`); return false; }
    if (!b.phone) { skipped.push(`${b.name}(번호 미등록)`); return false; }
    return true;
  });
  if (!targets.length) throw new Error(`보낼 수 있는 버틀러가 없습니다: ${skipped.join(", ")}`);

  const batchId = randomUUID();
  const expiresAt = inviteExpiry(new Date(), r.confirmDate);
  const rows = await Promise.all(targets.map((b) => prisma.butlerInvite.create({ data: { id: randomUUID(), reservationId, butlerId: b.id, batchId, token: randomBytes(16).toString("hex"), grade, side, need, expiresAt } })));
  let ok = 0;
  const failed: string[] = [];
  for (const row of rows) {
    const res = await sendInvite(row.id);
    if (res.sent) ok++; else failed.push(`${targets.find((b) => b.id === row.butlerId)?.name}(${res.detail})`);
  }
  return [`${ok}명에게 참석 문의를 보냈습니다.`, failed.length ? `보내지 못함: ${failed.join(", ")}` : "", skipped.length ? `제외: ${skipped.join(", ")}` : ""].filter(Boolean).join(" ");
}

/** 응답 대기 중인 문의를 다시 보낸다(기한을 새로 24시간으로). 만료된 문의도 다시 열린다. */
export async function resendInvite(id: string): Promise<string> {
  await ensureInviteTable();
  const inv = await prisma.butlerInvite.findUnique({ where: { id } });
  if (!inv || inv.status !== "pending") throw new Error("응답 대기 중인 문의만 다시 보낼 수 있습니다.");
  const r = await prisma.reservation.findUnique({ where: { id: inv.reservationId }, select: { confirmDate: true, status: true } });
  if (!r || r.status === "취소") throw new Error("취소된 예약입니다.");
  await prisma.butlerInvite.update({ where: { id }, data: { expiresAt: inviteExpiry(new Date(), r.confirmDate) } });
  const res = await sendInvite(id);
  if (!res.sent) throw new Error(`보내지 못했습니다 (${res.detail}).`);
  return "다시 보냈습니다.";
}

export async function cancelInvite(id: string): Promise<void> {
  await ensureInviteTable();
  const { count } = await prisma.butlerInvite.updateMany({ where: { id, status: "pending" }, data: { status: "cancelled" } });
  if (!count) throw new Error("응답 대기 중인 문의만 취소할 수 있습니다.");
}

export interface InviteRow { id: string; butlerId: string; name: string; grade: string; side: string; need: number; batchId: string; state: InviteState; expiresAt: string; sentAt: string | null }

export async function listInvites(reservationId: string): Promise<InviteRow[]> {
  await ensureInviteTable();
  const rows = await prisma.butlerInvite.findMany({ where: { reservationId }, orderBy: { createdAt: "asc" } });
  const names = new Map((await prisma.butler.findMany({ where: { id: { in: rows.map((x) => x.butlerId) } }, select: { id: true, name: true } })).map((b) => [b.id, b.name]));
  return rows.map((x) => ({ id: x.id, butlerId: x.butlerId, name: names.get(x.butlerId) ?? "(삭제된 버틀러)", grade: x.grade, side: x.side, need: x.need, batchId: x.batchId, state: inviteState(x), expiresAt: x.expiresAt.toISOString(), sentAt: x.sentAt?.toISOString() ?? null }));
}

/** 응답 결과를 오너 버틀러 카카오워크 방에 알린다(실패해도 응답은 유지). */
async function notifyResponse(inv: { reservationId: string; butlerId: string; grade: string; side: string }, what: string): Promise<void> {
  const [r, b] = await Promise.all([
    prisma.reservation.findUnique({ where: { id: inv.reservationId }, select: { id: true, confirmDate: true, confirmTime: true, confirmVenue: true, venueLabel: true } }),
    prisma.butler.findUnique({ where: { id: inv.butlerId }, select: { name: true } }),
  ]);
  if (!r) return;
  const grade = isButlerGrade(inv.grade) ? BUTLER_GRADES[inv.grade].label.replace(" 버틀러", "") : inv.grade;
  const admin = (process.env.ADMIN_URL || "https://admin.weddingbutler.co.kr").replace(/\/$/, "");
  await sendAssignKakaoWorkNotice([`버틀러 참석 문의 · ${b?.name ?? ""} ${what}`, `${r.id} · ${r.confirmDate} ${r.confirmTime} · ${r.confirmVenue || r.venueLabel}`, `문의 등급: ${grade}${inv.side ? `·${inv.side}` : ""}`, `${admin}/reservations/${r.id}`].join("\n")).catch(() => false);
}

export interface RespondResult { state: InviteState; message?: string }

/** 버틀러의 응답. 같은 링크를 여러 번 눌러도 결과는 같다. 선착순 판정은 예약 단위 DB 잠금 안에서 한다. */
export async function respondInvite(token: string, action: "accept" | "decline"): Promise<RespondResult> {
  if (!TOKEN.test(token)) return { state: "not_found" };
  await ensureFinanceTables();
  await ensureInviteTable();
  const first = await prisma.butlerInvite.findUnique({ where: { token } });
  if (!first) return { state: "not_found" };

  type Out = { state: InviteState; message?: string; claimed?: boolean };
  const out: Out = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${first.reservationId}))`;
    const inv = await tx.butlerInvite.findUnique({ where: { token } });
    if (!inv) return { state: "not_found" as const };
    const state = inviteState(inv);
    if (state !== "pending") return { state }; // 이미 응답했거나 마감·만료·취소
    const r = await tx.reservation.findUnique({ where: { id: inv.reservationId }, select: { status: true, confirmButlers: true } });
    if (!r || r.status === "취소") {
      await tx.butlerInvite.update({ where: { id: inv.id }, data: { status: "cancelled" } });
      return { state: "cancelled" as const };
    }
    if (action === "decline") {
      await tx.butlerInvite.update({ where: { id: inv.id }, data: { status: "declined", respondedAt: new Date() } });
      return { state: "declined" as const };
    }
    const [shifts, taken, hasOwner, mine] = await Promise.all([
      tx.butlerShift.count({ where: { reservationId: inv.reservationId } }),
      tx.butlerInvite.count({ where: { batchId: inv.batchId, status: "accepted" } }),
      tx.butlerShift.count({ where: { reservationId: inv.reservationId, grade: "owner" } }),
      tx.butlerShift.count({ where: { reservationId: inv.reservationId, butlerId: inv.butlerId } }),
    ]);
    if (shifts >= r.confirmButlers || taken >= inv.need) {
      await tx.butlerInvite.update({ where: { id: inv.id }, data: { status: "closed", respondedAt: new Date() } });
      return { state: "closed" as const };
    }
    if (inv.grade !== "owner" && !hasOwner) return { state: "wait" as const, message: "오너 버틀러가 확정된 뒤에 응답할 수 있습니다. 잠시 후 다시 눌러 주세요." };
    await tx.butlerInvite.update({ where: { id: inv.id }, data: { status: "accepted", respondedAt: new Date() } });
    return { state: "accepted" as const, claimed: mine === 0 };
  });

  const inv = first;
  if (out.state === "declined") await notifyResponse(inv, "불참");
  if (out.state !== "accepted" || !out.claimed) return { state: out.state, message: out.message };

  // 자리를 잡았으니 배정을 만든다. 실패하면 자리를 되돌린다.
  const before = await prisma.butlerShift.count({ where: { reservationId: inv.reservationId } });
  try {
    await createAssignment(inv.reservationId, inv.butlerId, inv.grade, inv.side);
  } catch (err) {
    await prisma.butlerInvite.update({ where: { id: inv.id }, data: { status: "pending", respondedAt: null } });
    return { state: "pending", message: "확정하지 못했습니다. 잠시 후 다시 시도하거나 웨딩버틀러로 연락해 주세요." };
  }
  // 같은 문의의 자리가 다 찼거나 예약의 인원이 다 찼으면 남은 후보 링크를 마감한다
  const [taken, shifts, r] = await Promise.all([
    prisma.butlerInvite.count({ where: { batchId: inv.batchId, status: "accepted" } }),
    prisma.butlerShift.count({ where: { reservationId: inv.reservationId } }),
    prisma.reservation.findUnique({ where: { id: inv.reservationId }, select: { confirmButlers: true } }),
  ]);
  const need = (await prisma.butlerInvite.findUnique({ where: { token } }))?.need ?? 1;
  if (shifts >= (r?.confirmButlers ?? 0)) await prisma.butlerInvite.updateMany({ where: { reservationId: inv.reservationId, status: "pending" }, data: { status: "closed" } });
  else if (taken >= need) await prisma.butlerInvite.updateMany({ where: { batchId: inv.batchId, status: "pending" }, data: { status: "closed" } });
  await notifyResponse(inv, "참석 확정");
  await notifyAssignCompleteIfFull(inv.reservationId, before).catch((e) => console.error("[butlerInvite] complete notice failed", e));
  return { state: "accepted" };
}
