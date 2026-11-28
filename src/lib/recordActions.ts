"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RETENTION_DAYS, addDays, customerUrl, fromKstInput, isExpired, newToken } from "@/lib/records";
import { sendRecordLinkAlimtalk } from "@/lib/alimtalk";

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("로그인이 필요합니다.");
  return session;
}

function revalidateRecord(reservationId: string) {
  revalidatePath(`/reservations/${reservationId}/record`);
  revalidatePath("/reservations");
}

export interface RecordEntryInput {
  envelopeNo: number;
  side: string;
  name: string;
  relation: string;
  amount: number | null;
  tickets: number;
  memo: string;
}

export interface RecordSaveInput {
  recordMode: string;
  handoverAt: string; // "YYYY-MM-DDTHH:MM" (KST)
  handoverEnvelopeCount: number;
  receiverLabel: string;
  staffCount: number;
  videoUrl: string;
  entries: RecordEntryInput[];
}

function int(v: unknown) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

type Validated = { error: string; rows?: undefined } | { error?: undefined; rows: RecordEntryInput[] };

function validateEntries(entries: RecordEntryInput[], sealed: boolean): Validated {
  const seen = new Set<number>();
  const rows: RecordEntryInput[] = [];
  for (const e of entries) {
    const name = String(e.name ?? "").trim();
    if (!name) continue; // 빈 줄은 저장하지 않는다
    const envelopeNo = int(e.envelopeNo);
    if (!envelopeNo) return { error: `${name} 님의 봉투번호가 비어 있어요.` };
    if (seen.has(envelopeNo)) return { error: `봉투번호 ${envelopeNo}번이 두 번 들어 있어요.` };
    seen.add(envelopeNo);
    rows.push({
      envelopeNo,
      side: e.side === "신부측" ? "신부측" : "신랑측",
      name,
      relation: String(e.relation ?? "").trim(),
      amount: sealed || e.amount == null ? null : int(e.amount),
      tickets: int(e.tickets),
      memo: String(e.memo ?? "").trim(),
    });
  }
  return { rows };
}

export async function saveRecord(reservationId: string, input: RecordSaveInput): Promise<{ ok: boolean; message: string }> {
  await requireSession();
  const sealed = input.recordMode === "sealed";
  const checked = validateEntries(input.entries, sealed);
  if (checked.error !== undefined) return { ok: false, message: checked.error };
  const rows = checked.rows;

  const handoverAt = input.handoverAt ? fromKstInput(input.handoverAt) : null;
  if (input.handoverAt && !handoverAt) return { ok: false, message: "인계 시각 형식을 확인해 주세요." };

  const existing = await prisma.recordLink.findUnique({ where: { reservationId } });
  const data = {
    recordMode: sealed ? "sealed" : "opened",
    handoverAt,
    handoverEnvelopeCount: int(input.handoverEnvelopeCount),
    receiverLabel: input.receiverLabel.trim(),
    staffCount: int(input.staffCount),
    videoUrl: input.videoUrl.trim(),
  };

  await prisma.$transaction(async (tx) => {
    const link = existing
      ? await tx.recordLink.update({
          where: { id: existing.id },
          // 게시 중이거나 실시간 공유 중인 기록을 고치면 고객 화면의 버전이 올라간다
          data: { ...data, ...(existing.status === "published" || existing.status === "live" ? { version: { increment: 1 } } : {}) },
        })
      : await tx.recordLink.create({ data: { ...data, reservationId, token: newToken() } });
    await tx.recordEntry.deleteMany({ where: { recordLinkId: link.id } });
    if (rows.length > 0) {
      await tx.recordEntry.createMany({ data: rows.map((r) => ({ ...r, recordLinkId: link.id })) });
    }
  });

  revalidateRecord(reservationId);
  return {
    ok: true,
    message: existing?.status === "published" || existing?.status === "live" ? "저장했어요. 고객 화면에도 바로 반영돼요." : "저장했어요.",
  };
}

export async function publishRecord(reservationId: string): Promise<{ ok: boolean; message: string }> {
  await requireSession();
  const link = await prisma.recordLink.findUnique({ where: { reservationId }, include: { _count: { select: { entries: true } } } });
  if (!link) return { ok: false, message: "먼저 명단을 저장해 주세요." };
  if (link._count.entries === 0) return { ok: false, message: "명단이 비어 있어서 게시할 수 없어요." };

  const now = new Date();
  const publishedAt = link.publishedAt ?? now;
  await prisma.recordLink.update({
    where: { id: link.id },
    data: {
      status: "published",
      publishedAt,
      expiresAt: link.expiresAt ?? addDays(publishedAt, RETENTION_DAYS),
      version: Math.max(1, link.version),
    },
  });
  revalidateRecord(reservationId);
  return { ok: true, message: "게시했어요. 고객에게 링크를 보내 주세요." };
}

/** 게시하지 않고 고객이 지금 바로 볼 수 있게 한다(실시간 공유). 저장할 때마다 고객 화면이 자동으로 갱신된다. */
export async function startLiveRecord(reservationId: string): Promise<{ ok: boolean; message: string }> {
  await requireSession();
  const link = await prisma.recordLink.findUnique({ where: { reservationId } });
  if (!link) return { ok: false, message: "먼저 기록을 저장해 주세요." };
  if (link.status === "published") return { ok: true, message: "이미 게시된 기록이에요." };
  await prisma.recordLink.update({
    where: { id: link.id },
    data: { status: "live", expiresAt: link.expiresAt ?? addDays(new Date(), RETENTION_DAYS), version: Math.max(1, link.version) },
  });
  revalidateRecord(reservationId);
  return { ok: true, message: "실시간 공유를 시작했어요. 고객에게 링크를 보내 주세요. 저장하면 고객 화면이 곧 갱신돼요." };
}

/** 실시간 공유를 멈추고 작성 중 상태로 되돌린다. 보낸 주소는 다시 열리지 않는다. */
export async function stopLiveRecord(reservationId: string): Promise<{ ok: boolean; message: string }> {
  await requireSession();
  const link = await prisma.recordLink.findUnique({ where: { reservationId } });
  if (!link || link.status !== "live") return { ok: false, message: "실시간 공유 중이 아니에요." };
  await prisma.recordLink.update({ where: { id: link.id }, data: { status: "draft" } });
  revalidateRecord(reservationId);
  return { ok: true, message: "실시간 공유를 멈췄어요. 다시 시작하면 같은 주소로 열려요." };
}

export async function revokeRecord(reservationId: string): Promise<{ ok: boolean; message: string }> {
  await requireSession();
  const link = await prisma.recordLink.findUnique({ where: { reservationId } });
  if (!link) return { ok: false, message: "게시된 기록이 없어요." };
  // 상태만 회수로 바꿔 접속을 막는다. 주소(예약번호)는 그대로라 알림톡으로 나간 링크도 다시 게시하면 살아난다.
  await prisma.recordLink.update({ where: { id: link.id }, data: { status: "revoked" } });
  revalidateRecord(reservationId);
  return { ok: true, message: "링크를 회수했어요. 다시 게시하거나 실시간 공유를 시작하기 전까지 주소가 열리지 않아요." };
}

/** 열려 있는(게시·실시간 공유) 축의 기록의 주소를 고객 예약 번호로 보낸다. */
export async function sendRecordLink(reservationId: string): Promise<{ ok: boolean; message: string }> {
  await requireSession();
  const link = await prisma.recordLink.findUnique({ where: { reservationId }, include: { reservation: true } });
  if (!link || (link.status !== "published" && link.status !== "live")) return { ok: false, message: "게시하거나 실시간 공유를 시작한 뒤에 보낼 수 있어요." };
  if (isExpired(link)) return { ok: false, message: "열람 기한이 지난 기록이에요." };
  const r = link.reservation;
  if (r.status === "취소") return { ok: false, message: "취소된 예약이에요." };
  if (!r.phone) return { ok: false, message: "예약에 휴대폰 번호가 없어요." };
  const until = link.expiresAt ? new Date(link.expiresAt.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, ".") : "추후 안내";
  const variables = { "#{customer}": r.customer, "#{bookingNo}": r.id, "#{expiresAt}": until, "#{recordCode}": r.id };
  const text = [
    "[웨딩버틀러] 축의 기록 안내",
    "",
    `${r.customer} 고객님, 예식의 축의 기록이 준비되었습니다.`,
    "",
    `예약번호: ${r.id}`,
    `열람 기한: ${until}까지`,
    "",
    "아래 주소에서 예약하신 휴대폰 번호로 문자 인증을 하시면 확인하실 수 있습니다.",
    customerUrl(r.id),
  ].join("\n");
  const res = await sendRecordLinkAlimtalk(r.id, r.phone, variables, text);
  if (res.sent) await prisma.note.create({ data: { reservationId: r.id, text: `축의 기록 링크 발송 (${res.detail})` } });
  revalidateRecord(reservationId);
  return res.sent ? { ok: true, message: `축의 기록 링크를 ${res.detail}으로 보냈어요.` } : { ok: false, message: `보내지 못했어요 (${res.detail}).` };
}
