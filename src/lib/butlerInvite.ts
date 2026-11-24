import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ensureFinanceTables } from "@/lib/finance";
import { pad2 } from "@/lib/format";
import { homepageUrl } from "@/lib/records";
import { sendButlerInviteAlimtalk } from "@/lib/alimtalk";
import { sendAssignKakaoWorkNotice } from "@/lib/kakaowork";
import { cut, workStartLabel } from "@/lib/butlerNotice";

// 버틀러 참석 문의 (2026-11-23). 관리자가 예약 1건에 대해 후보 버틀러에게 링크를 보내면, 후보는 홈페이지 /b/<token> 에서
// "참석 가능" / "참석 불가"만 답한다. 배정(등급·담당 쪽·확정)은 응답을 보고 관리자가 배정 카드에서 직접 한다.
// 응답 기한은 발송 후 24시간(예식일이 더 가까우면 예식일 끝까지). 답한 뒤에는 발송 후 48시간까지, 배정되기 전이면 링크에서 답을 바꿀 수 있다.

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

// status: "pending"(응답 대기) | "available"(참석 가능) | "unavailable"(참석 불가) | "cancelled". 만료는 expiresAt 로 판단한다.
export type InviteState = "pending" | "available" | "unavailable" | "cancelled" | "expired" | "not_found";

/** 만료 시각: 지금부터 24시간, 예식일이 더 가까우면 예식일 밤 12시(한국)까지 */
export function inviteExpiry(now: Date, weddingDate: string): Date {
  const limit = new Date(now.getTime() + INVITE_HOURS * 3600_000);
  const end = new Date(`${weddingDate}T23:59:59+09:00`);
  return end.getTime() < limit.getTime() ? end : limit;
}

/** 답을 바꿀 수 있는 마지막 시각: 응답 기한(발송 후 24시간)에서 24시간을 더해 발송 후 48시간. 예식일이 더 가까우면 예식일 끝까지. */
export function inviteChangeUntil(expiresAt: Date, weddingDate: string): Date {
  const limit = new Date(expiresAt.getTime() + 24 * 3600_000);
  const end = new Date(`${weddingDate}T23:59:59+09:00`);
  return end.getTime() < limit.getTime() ? end : limit;
}

/** 화면에 보여 줄 상태. 아직 답하지 않았는데 기한이 지났으면 만료로 본다(답한 뒤에는 그 답을 유지). */
export function inviteState(o: { status: string; expiresAt: Date }, now = new Date()): InviteState {
  if (o.status === "pending") return o.expiresAt.getTime() <= now.getTime() ? "expired" : "pending";
  const legacy: Record<string, InviteState> = { accepted: "available", declined: "unavailable", closed: "cancelled" }; // 선착순 확정 방식 시험 때 남은 값
  return legacy[o.status] ?? (o.status as InviteState);
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
  date: string;
  time: string;
  venue: string;
  start: string;
  deadline: string;
  /** 답을 바꿀 수 있는 마지막 시각 (표시용) */
  changeUntil: string;
}

async function infoOf(inv: { reservationId: string; butlerId: string; expiresAt: Date }): Promise<InviteInfo | null> {
  const [r, butler] = await Promise.all([
    prisma.reservation.findUnique({ where: { id: inv.reservationId }, select: { confirmDate: true, confirmTime: true, confirmVenue: true, venueLabel: true } }),
    prisma.butler.findUnique({ where: { id: inv.butlerId }, select: { name: true } }),
  ]);
  if (!r || !butler) return null;
  return {
    name: butler.name,
    date: dateOnly(r.confirmDate),
    time: /^\d{1,2}:\d{2}$/.test(r.confirmTime) ? r.confirmTime : "시간 미정",
    venue: cut(r.confirmVenue || r.venueLabel),
    start: /^\d{1,2}:\d{2}$/.test(r.confirmTime) ? `${workStartLabel(r.confirmTime)}까지 도착` : "추후 안내", // 예식 1시간 전까지 도착
    deadline: deadlineLabel(inv.expiresAt),
    changeUntil: deadlineLabel(inviteChangeUntil(inv.expiresAt, r.confirmDate)),
  };
}

async function isAssigned(inv: { reservationId: string; butlerId: string }): Promise<boolean> {
  return (await prisma.butlerShift.count({ where: { reservationId: inv.reservationId, butlerId: inv.butlerId } })) > 0;
}

/** 홈페이지 /b/<token> 이 보여 줄 정보. 대기·응답 상태일 때만 예식 정보를 준다. */
export async function getInviteView(token: string): Promise<{ state: InviteState; info?: InviteInfo; locked?: boolean }> {
  if (!TOKEN.test(token)) return { state: "not_found" };
  await ensureInviteTable();
  const inv = await prisma.butlerInvite.findUnique({ where: { token } });
  if (!inv) return { state: "not_found" };
  let state = inviteState(inv);
  if (state === "pending" || state === "available" || state === "unavailable") {
    const r = await prisma.reservation.findUnique({ where: { id: inv.reservationId }, select: { status: true } });
    if (!r || r.status === "취소") state = "cancelled";
  }
  const info = state === "pending" || state === "available" || state === "unavailable" ? await infoOf(inv) : null;
  // 이미 배정됐으면 링크에서는 답을 바꿀 수 없다(관리자에게 연락)
  const locked = info ? await isAssigned(inv) : false;
  return info ? { state, info, locked } : { state };
}

function messageParts(info: InviteInfo, token: string) {
  // 담당 쪽·정산금은 배정할 때 관리자가 정하므로 "추후 안내"를 보낸다(템플릿에 없는 변수는 발송할 때 빠진다).
  const variables = {
    "#{name}": info.name,
    "#{date}": info.date,
    "#{time}": info.time,
    "#{venue}": info.venue,
    "#{side}": "추후 안내",
    "#{start}": info.start,
    "#{pay}": "추후 안내",
    "#{deadline}": info.deadline,
    "#{changeUntil}": info.changeUntil, // 새 템플릿에만 있다(없으면 발송할 때 빠진다)
    "#{url}": inviteUrl(token).replace(/^https?:\/\//, ""), // 버튼 링크가 http://#{url} 이라 스킴을 뺀다
  };
  const text = [
    "[웨딩버틀러] 참석 가능 여부를 알려주세요",
    "",
    `${info.name} 버틀러님, 아래 예식에 참석이 가능하신지 확인 부탁드립니다.`,
    "",
    `일시: ${info.date} ${info.time}`,
    `장소: ${info.venue}`,
    `근무 시작: ${info.start}`,
    "",
    `${info.deadline}까지 응답해 주세요.`,
    `응답 후에도 아래 링크에서 ${info.changeUntil}까지 답을 바꿀 수 있습니다.`,
    inviteUrl(token),
  ].join("\n");
  return { variables, text };
}

/** 문의 한 건을 보낸다 (알림톡, 실패하면 솔라피가 문자로 대신). */
/** 예약 메모에 이력을 남긴다 (예약 상세의 메모 목록에 시각과 함께 보인다). 실패해도 흐름은 막지 않는다. */
async function logNote(reservationId: string, text: string): Promise<void> {
  await prisma.note.create({ data: { reservationId, text: `[자동] 참석 문의 · ${text}` } }).catch((e) => console.error("[butlerInvite] note failed", e));
}

async function sendInvite(id: string, again = false): Promise<{ sent: boolean; detail: string }> {
  const inv = await prisma.butlerInvite.findUnique({ where: { id } });
  if (!inv) return { sent: false, detail: "문의 없음" };
  const butler = await prisma.butler.findUnique({ where: { id: inv.butlerId } });
  const info = await infoOf(inv);
  if (!butler || !info) return { sent: false, detail: "정보 없음" };
  if (!butler.phone) return { sent: false, detail: "휴대폰 번호 미등록" };
  const { variables, text } = messageParts(info, inv.token);
  const res = await sendButlerInviteAlimtalk(inv.reservationId, inv.butlerId, butler.phone, variables, text);
  if (res.sent) await prisma.butlerInvite.update({ where: { id }, data: { sentAt: new Date() } });
  await logNote(inv.reservationId, `${butler.name} ${again ? "재발송" : "발송"} ${res.sent ? "(전송 완료)" : `실패 (${res.detail})`} · 응답 기한 ${info.deadline}`);
  return res;
}

export interface CreateInput { reservationId: string; butlerIds: string[] }

/** 후보 버틀러들에게 참석 문의를 만들어 보낸다. 화면에 띄울 결과 문구를 돌려준다. */
export async function createInvites(input: CreateInput): Promise<string> {
  await ensureFinanceTables();
  await ensureInviteTable();
  const { reservationId, butlerIds } = input;
  if (!butlerIds.length) throw new Error("문의할 버틀러를 골라 주세요.");
  const r = await prisma.reservation.findUnique({ where: { id: reservationId }, select: { status: true, confirmDate: true } });
  if (!r) throw new Error("예약을 찾을 수 없습니다.");
  if (r.status === "취소") throw new Error("취소된 예약에는 문의할 수 없습니다.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.confirmDate)) throw new Error("예식 날짜가 정해진 뒤에 문의할 수 있습니다.");
  const [shifts, open] = await Promise.all([
    prisma.butlerShift.findMany({ where: { reservationId }, select: { butlerId: true } }),
    prisma.butlerInvite.findMany({ where: { reservationId, status: "pending", expiresAt: { gt: new Date() } }, select: { butlerId: true } }),
  ]);
  const butlers = await prisma.butler.findMany({ where: { id: { in: butlerIds } } });
  const skipped: string[] = [];
  const targets = butlers.filter((b) => {
    if (shifts.some((s) => s.butlerId === b.id)) { skipped.push(`${b.name}(이미 배정됨)`); return false; }
    if (open.some((p) => p.butlerId === b.id)) { skipped.push(`${b.name}(응답 대기 중인 문의 있음)`); return false; }
    if (!b.phone) { skipped.push(`${b.name}(번호 미등록)`); return false; }
    return true;
  });
  if (!targets.length) throw new Error(`보낼 수 있는 버틀러가 없습니다: ${skipped.join(", ")}`);

  const batchId = randomUUID();
  const expiresAt = inviteExpiry(new Date(), r.confirmDate);
  const rows = await Promise.all(targets.map((b) => prisma.butlerInvite.create({ data: { id: randomUUID(), reservationId, butlerId: b.id, batchId, token: randomBytes(16).toString("hex"), grade: "", side: "", need: 1, expiresAt } })));
  let ok = 0;
  const failed: string[] = [];
  for (const row of rows) {
    const res = await sendInvite(row.id);
    if (res.sent) ok++; else failed.push(`${targets.find((b) => b.id === row.butlerId)?.name}(${res.detail})`);
  }
  return [`${ok}명에게 참석 문의를 보냈습니다.`, failed.length ? `보내지 못함: ${failed.join(", ")}` : "", skipped.length ? `제외: ${skipped.join(", ")}` : ""].filter(Boolean).join(" ");
}

/** 응답이 없는 문의를 다시 보낸다(기한을 새로 24시간으로). 만료된 문의도 다시 열린다. */
export async function resendInvite(id: string): Promise<string> {
  await ensureInviteTable();
  const inv = await prisma.butlerInvite.findUnique({ where: { id } });
  if (!inv || inv.status !== "pending") throw new Error("응답 대기 중인 문의만 다시 보낼 수 있습니다.");
  const r = await prisma.reservation.findUnique({ where: { id: inv.reservationId }, select: { confirmDate: true, status: true } });
  if (!r || r.status === "취소") throw new Error("취소된 예약입니다.");
  await prisma.butlerInvite.update({ where: { id }, data: { expiresAt: inviteExpiry(new Date(), r.confirmDate) } });
  const res = await sendInvite(id, true);
  if (!res.sent) throw new Error(`보내지 못했습니다 (${res.detail}).`);
  return "다시 보냈습니다.";
}

export async function cancelInvite(id: string): Promise<void> {
  await ensureInviteTable();
  const inv = await prisma.butlerInvite.findUnique({ where: { id } });
  const { count } = await prisma.butlerInvite.updateMany({ where: { id, status: "pending" }, data: { status: "cancelled" } });
  if (!count || !inv) throw new Error("응답 대기 중인 문의만 취소할 수 있습니다.");
  const b = await prisma.butler.findUnique({ where: { id: inv.butlerId }, select: { name: true } });
  await logNote(inv.reservationId, `${b?.name ?? ""} 문의 취소`);
}

export interface InviteRow { id: string; butlerId: string; name: string; state: InviteState; expiresAt: string; sentAt: string | null; respondedAt: string | null }

export async function listInvites(reservationId: string): Promise<InviteRow[]> {
  await ensureInviteTable();
  const rows = await prisma.butlerInvite.findMany({ where: { reservationId }, orderBy: { createdAt: "asc" } });
  const names = new Map((await prisma.butler.findMany({ where: { id: { in: rows.map((x) => x.butlerId) } }, select: { id: true, name: true } })).map((b) => [b.id, b.name]));
  return rows.map((x) => ({ id: x.id, butlerId: x.butlerId, name: names.get(x.butlerId) ?? "(삭제된 버틀러)", state: inviteState(x), expiresAt: x.expiresAt.toISOString(), sentAt: x.sentAt?.toISOString() ?? null, respondedAt: x.respondedAt?.toISOString() ?? null }));
}

/** 응답을 오너 버틀러 카카오워크 방에 알린다(실패해도 응답은 유지). */
async function notifyResponse(inv: { reservationId: string; butlerId: string }, what: string): Promise<void> {
  const [r, b] = await Promise.all([
    prisma.reservation.findUnique({ where: { id: inv.reservationId }, select: { id: true, confirmDate: true, confirmTime: true, confirmVenue: true, venueLabel: true } }),
    prisma.butler.findUnique({ where: { id: inv.butlerId }, select: { name: true } }),
  ]);
  if (!r) return;
  const admin = (process.env.ADMIN_URL || "https://admin.weddingbutler.co.kr").replace(/\/$/, "");
  await sendAssignKakaoWorkNotice([`버틀러 참석 문의 · ${b?.name ?? ""} ${what}`, `${r.id} · ${r.confirmDate} ${r.confirmTime} · ${r.confirmVenue || r.venueLabel}`, `${admin}/reservations/${r.id}`].join("\n")).catch(() => false);
}

export interface RespondResult { state: InviteState }

/** 버틀러의 응답. 답한 뒤에도 발송 후 48시간까지(배정 전) 링크에서 바꿀 수 있고, 같은 답을 다시 눌러도 결과는 같다. */
export async function respondInvite(token: string, action: "accept" | "decline"): Promise<RespondResult> {
  if (!TOKEN.test(token)) return { state: "not_found" };
  await ensureInviteTable();
  const inv = await prisma.butlerInvite.findUnique({ where: { token } });
  if (!inv) return { state: "not_found" };
  const state = inviteState(inv);
  if (state !== "pending" && state !== "available" && state !== "unavailable") return { state };
  const r = await prisma.reservation.findUnique({ where: { id: inv.reservationId }, select: { status: true, confirmDate: true } });
  if (!r || r.status === "취소") return { state: "cancelled" };
  // 아직 답하지 않았으면 응답 기한(발송 후 24시간) 안에, 이미 답했으면 변경 기한(발송 후 48시간) 안에 바꿀 수 있다. 이미 배정됐으면 바꿀 수 없다.
  if ((state === "pending" ? inv.expiresAt : inviteChangeUntil(inv.expiresAt, r.confirmDate)).getTime() <= Date.now()) return { state: "expired" };
  if (await isAssigned(inv)) return { state };
  const next = action === "accept" ? "available" : "unavailable";
  if (inv.status !== next) {
    await prisma.butlerInvite.update({ where: { id: inv.id }, data: { status: next, respondedAt: new Date() } });
    const what = next === "available" ? "참석 가능" : "참석 불가";
    const b = await prisma.butler.findUnique({ where: { id: inv.butlerId }, select: { name: true } });
    await logNote(inv.reservationId, `${b?.name ?? ""} 응답: ${what}${inv.status === "pending" ? "" : " (답 변경)"}`);
    await notifyResponse(inv, what);
  }
  return { state: next };
}
