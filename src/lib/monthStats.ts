import { prisma } from "@/lib/prisma";
import { reservationTotal } from "@/lib/view";

// 이번 달(한국 시간) 1일 0시를 UTC Date로. 서버는 UTC로 돈다.
export function kstMonthStart(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - 9 * 3600_000);
}

// 이번 달에 결제(신청)된 예약 중 확정 상태인 것. 홈페이지 예약은 신청할 때 결제되므로
// 결제일은 requestedAt으로 본다.
export async function monthPaidConfirmed() {
  const items = await prisma.reservation.findMany({ where: { status: "확정", requestedAt: { gte: kstMonthStart() } } });
  return { count: items.length, amount: items.reduce((sum, r) => sum + reservationTotal(r), 0) };
}
