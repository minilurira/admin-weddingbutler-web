import { prisma } from "@/lib/prisma";
import { confirmTotalOf, EXTRA_GUEST_FEE, extraGuestDue, guestLimitAt, onsiteAmount, PAYMENT_TYPES, isPaymentType, planMeta, won } from "@/lib/pricing";
import { isClaimUid, sendPaymentLinkFor } from "@/lib/paymentLink";
import { formatStamp } from "@/lib/format";

// 예식 후 추가 하객 차액 청구. 청구는 일반 결제 링크(paymentLink.ts)로 보내고, 주문번호 끝이 -G(이전 방식 -X)인 링크가 차액 청구다.
// 남은 잔금(예약금만 낸 고객)이 있으면 잔금 + 차액을 링크 하나로 보낼 수 있다.
// 결제된 -G 링크의 추가 하객은 웹훅이 확정 추가 하객(confirmExtraGuests)에 더한다. 이전 방식 -X 링크는 금액 합으로만 뺀다.

export interface ExtraGuestView {
  eligible: boolean;
  reason: string;
  plan: string;
  guestLimit: number;
  billedExtraGuests: number;
  fee: number;
  /** 예약 때 고객이 적어 낸 인원(참고용) */
  declaredLabel: string;
  claims: { id: string; amount: number; extraGuests: number; status: string; createdLabel: string; paidLabel: string; url: string; expired: boolean }[];
  /** 이전 방식(-X)으로 결제된 차액 합 */
  paidClaim: number;
  /** 남은 잔금(확정 총액 − 결제한 금액) */
  balance: number;
  paymentTypeLabel: string;
}

const isLegacyClaim = (merchantUid: string) => /-X\d+$/.test(merchantUid);

export async function loadExtraGuest(reservationId: string): Promise<ExtraGuestView> {
  const r = await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: { paymentLinks: { orderBy: { createdAt: "desc" } } } });
  const claims = r.paymentLinks.filter((l) => isClaimUid(l.merchantUid));
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
    claims: claims.map((l) => ({ id: l.id, amount: l.amount, extraGuests: l.extraGuests, status: l.status, createdLabel: formatStamp(l.createdAt), paidLabel: l.paidAt ? formatStamp(l.paidAt) : "", url: l.url, expired: l.status === "sent" && l.expiresAt.getTime() <= Date.now() })),
    paidClaim: claims.filter((l) => l.status === "paid" && isLegacyClaim(l.merchantUid)).reduce((a, l) => a + (l.paidAmount || l.amount), 0),
    balance: onsiteAmount(confirmTotalOf(r), r.paidAmount),
    paymentTypeLabel: isPaymentType(r.paymentType) ? PAYMENT_TYPES[r.paymentType].name : "",
  };
}

/** actualGuests가 0이면 인원 없이 잔금만 청구한다(includeBalance일 때만). */
export async function sendExtraGuestClaim(reservationId: string, actualGuests: number, includeBalance: boolean): Promise<{ ok: boolean; message: string }> {
  if (!Number.isInteger(actualGuests) || actualGuests < 0 || actualGuests > 5000 || (actualGuests === 0 && !includeBalance)) return { ok: false, message: "실제 접수 인원을 확인해 주세요." };
  const v = await loadExtraGuest(reservationId);
  if (!v.eligible) return { ok: false, message: v.reason };
  const due = actualGuests ? extraGuestDue({ actualGuests, guestLimit: v.guestLimit, billedExtraGuests: v.billedExtraGuests, paidClaim: v.paidClaim }) : { actualExtra: 0, amount: 0 };
  const balance = includeBalance ? v.balance : 0;
  if (includeBalance && balance <= 0) return { ok: false, message: "남은 잔금이 없습니다." };
  if (due.amount + balance <= 0) return { ok: false, message: `청구할 차액이 없습니다 (실제 ${actualGuests}명, 기준 ${v.guestLimit}명${due.actualExtra ? `, 추가 ${due.actualExtra}명은 이미 결제됨` : ""}).` };
  // 이번 링크에 담는 추가 하객 수 = 차액 금액 ÷ 1인 요금 (이전 방식 결제분은 금액으로 이미 빠져 있다)
  const extraGuests = Math.floor(due.amount / EXTRA_GUEST_FEE);
  const r = await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } });
  const res = await sendPaymentLinkFor(r, { amount: due.amount + balance, paymentType: "", days: 7, claim: { extraGuests, includesBalance: balance > 0 } });
  if (res.ok) {
    const parts = [balance > 0 ? `잔금 ${won(balance)}` : "", due.amount > 0 ? `추가 하객 ${extraGuests}명 차액 ${won(due.amount)}` : ""].filter(Boolean).join(" + ");
    await prisma.note.create({ data: { reservationId, text: `추가 하객 차액 청구 · ${actualGuests ? `실제 접수 ${actualGuests}명(기준 ${v.guestLimit}명)` : "인원 입력 없음"} · ${parts} = ${won(due.amount + balance)}` } });
  }
  return res;
}
