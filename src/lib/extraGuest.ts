import { prisma } from "@/lib/prisma";
import { EXTRA_GUEST_FEE, extraGuestDue, guestLimitAt, planMeta, won } from "@/lib/pricing";
import { sendPaymentLinkFor } from "@/lib/paymentLink";
import { formatStamp } from "@/lib/format";

// 예식 후 추가 하객 차액 청구. 청구는 일반 결제 링크(paymentLink.ts)로 보내고, 주문번호 끝이 -X 인 링크가 차액 청구다.
// 별도 테이블은 없다: 이미 결제된 차액 = 결제 완료된 -X 링크 금액의 합.

export interface ExtraGuestView {
  eligible: boolean;
  reason: string;
  plan: string;
  guestLimit: number;
  billedExtraGuests: number;
  fee: number;
  /** 예약 때 고객이 적어 낸 인원(참고용) */
  declaredLabel: string;
  claims: { id: string; amount: number; status: string; createdLabel: string; paidLabel: string; url: string }[];
  paidClaim: number;
}

const isClaim = (merchantUid: string) => /-X\d+$/.test(merchantUid);

export async function loadExtraGuest(reservationId: string): Promise<ExtraGuestView> {
  const r = await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: { paymentLinks: { orderBy: { createdAt: "desc" } } } });
  const claims = r.paymentLinks.filter((l) => isClaim(l.merchantUid));
  const plan = r.confirmPlan || r.requestedPlan;
  const eligible = r.status === "확정";
  return {
    eligible,
    reason: eligible ? "" : r.status === "취소" ? "취소된 예약입니다." : "예약이 확정된 뒤에 청구할 수 있습니다.",
    plan,
    guestLimit: guestLimitAt(planMeta(plan), r.requestedAt),
    billedExtraGuests: r.confirmExtraGuests,
    fee: EXTRA_GUEST_FEE,
    declaredLabel: r.guestsLabel,
    claims: claims.map((l) => ({ id: l.id, amount: l.amount, status: l.status, createdLabel: formatStamp(l.createdAt), paidLabel: l.paidAt ? formatStamp(l.paidAt) : "", url: l.url })),
    paidClaim: claims.filter((l) => l.status === "paid").reduce((a, l) => a + (l.paidAmount || l.amount), 0),
  };
}

export async function sendExtraGuestClaim(reservationId: string, actualGuests: number): Promise<{ ok: boolean; message: string }> {
  if (!Number.isInteger(actualGuests) || actualGuests < 1 || actualGuests > 5000) return { ok: false, message: "실제 접수 인원을 확인해 주세요." };
  const v = await loadExtraGuest(reservationId);
  if (!v.eligible) return { ok: false, message: v.reason };
  const { actualExtra, amount } = extraGuestDue({ actualGuests, guestLimit: v.guestLimit, billedExtraGuests: v.billedExtraGuests, paidClaim: v.paidClaim });
  if (amount <= 0) return { ok: false, message: `청구할 차액이 없습니다 (실제 ${actualGuests}명, 기준 ${v.guestLimit}명${actualExtra ? `, 추가 ${actualExtra}명은 이미 결제됨` : ""}).` };
  const r = await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } });
  const res = await sendPaymentLinkFor(r, { amount, paymentType: r.paymentType, days: 7, extraGuests: true });
  if (res.ok) await prisma.note.create({ data: { reservationId, text: `추가 하객 차액 청구 · 실제 접수 ${actualGuests}명(기준 ${v.guestLimit}명) · ${won(amount)}` } });
  return res;
}
