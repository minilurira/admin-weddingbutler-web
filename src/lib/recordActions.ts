"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RETENTION_DAYS, addDays, fromKstInput, newToken } from "@/lib/records";

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

function validateEntries(entries: RecordEntryInput[], sealed: boolean) {
  const seen = new Set<number>();
  const rows: RecordEntryInput[] = [];
  for (const e of entries) {
    const name = String(e.name ?? "").trim();
    if (!name) continue; // 빈 줄은 저장하지 않는다
    const envelopeNo = int(e.envelopeNo);
    if (!envelopeNo) return { error: `${name} 님의 봉투번호가 비어 있어요.` } as const;
    if (seen.has(envelopeNo)) return { error: `봉투번호 ${envelopeNo}번이 두 번 들어 있어요.` } as const;
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
  return { rows } as const;
}

export async function saveRecord(reservationId: string, input: RecordSaveInput) {
  await requireSession();
  const sealed = input.recordMode === "sealed";
  const checked = validateEntries(input.entries, sealed);
  if ("error" in checked) return { ok: false, message: checked.error };

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
          // 게시 중인 기록을 고치면 고객 화면의 버전이 올라간다
          data: { ...data, ...(existing.status === "published" ? { version: { increment: 1 } } : {}) },
        })
      : await tx.recordLink.create({ data: { ...data, reservationId, token: newToken() } });
    await tx.recordEntry.deleteMany({ where: { recordLinkId: link.id } });
    if (checked.rows.length > 0) {
      await tx.recordEntry.createMany({ data: checked.rows.map((r) => ({ ...r, recordLinkId: link.id })) });
    }
  });

  revalidateRecord(reservationId);
  return {
    ok: true,
    message: existing?.status === "published" ? "저장했어요. 고객 화면에도 바로 반영돼요." : "저장했어요.",
  };
}

export async function publishRecord(reservationId: string) {
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

export async function revokeRecord(reservationId: string) {
  await requireSession();
  const link = await prisma.recordLink.findUnique({ where: { reservationId } });
  if (!link) return { ok: false, message: "게시된 기록이 없어요." };
  // 토큰을 바꿔서 이미 보낸 주소는 바로 막는다. 다시 게시하면 새 주소가 생긴다.
  await prisma.recordLink.update({ where: { id: link.id }, data: { status: "revoked", token: newToken() } });
  revalidateRecord(reservationId);
  return { ok: true, message: "링크를 회수했어요. 기존 주소는 더 이상 열리지 않아요." };
}
