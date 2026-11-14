import { prisma } from "@/lib/prisma";
import { BUTLER_GRADES, isButlerGrade } from "@/lib/financeCalc";
import { sendAssignKakaoWorkNotice } from "@/lib/kakaowork";
import { weddingDateLabel } from "@/lib/butlerNotice";

// 예약의 배정 인원이 필요 인원(확정 버틀러 수)에 차는 순간, 오너 버틀러 카카오워크 방에 배정 명단을 알린다 (2026-11-14 루리님 요청).
// 처음 차면 "버틀러 배정 완료", 해제 후 다시 차면 "버틀러 배정 변경". 보낸 기록은 예약 메모에 [자동]으로 남긴다.

const NOTE_PREFIX = "[자동] 버틀러 배정 완료 카카오워크";

function adminUrl(): string {
  return (process.env.ADMIN_URL || "https://admin.weddingbutler.co.kr").replace(/\/$/, "");
}

/** 배정 직전 인원(before)에서 한 명이 늘어 필요 인원에 딱 찼으면 알린다. */
export async function notifyAssignCompleteIfFull(reservationId: string, before: number): Promise<void> {
  const r = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!r || r.status === "취소") return;
  const required = r.confirmButlers;
  if (required <= 0) return;
  const shifts = await prisma.butlerShift.findMany({ where: { reservationId }, include: { butler: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
  if (!(before < required && shifts.length >= required)) return;

  const sentBefore = await prisma.note.count({ where: { reservationId, text: { startsWith: NOTE_PREFIX } } });
  const title = sentBefore ? "버틀러 배정 변경" : "버틀러 배정 완료";
  const order = { owner: 0, manager: 1, staff: 2 } as Record<string, number>;
  const lines = [...shifts]
    .sort((a, b) => (order[a.grade] ?? 3) - (order[b.grade] ?? 3))
    .map((s) => {
      const grade = isButlerGrade(s.grade) ? BUTLER_GRADES[s.grade].label.replace(" 버틀러", "") : s.grade;
      return `• ${s.butler.name} (${grade}${s.side ? `·${s.side}` : ""})`;
    });
  const text = [
    `${title} (${r.id}) ${shifts.length}/${required}명`,
    `예식: ${weddingDateLabel(r.confirmDate, r.confirmTime)} · ${r.confirmVenue || r.venueLabel}`,
    `신랑신부: ${r.couple || r.customer}`,
    `플랜: ${r.confirmPlan}${r.side ? ` · ${r.side}` : ""}`,
    "버틀러:",
    ...lines,
    `${adminUrl()}/reservations/${r.id}`,
  ].join("\n");

  if (await sendAssignKakaoWorkNotice(text)) {
    await prisma.note.create({ data: { reservationId, text: `${NOTE_PREFIX} 발송 (${title}, ${shifts.map((s) => s.butler.name).join(", ")})` } });
  }
}
