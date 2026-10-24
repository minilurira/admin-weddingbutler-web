import type { Reservation } from "@prisma/client";
import { confirmTotalOf, onsiteAmount, PAYMENT_TYPES, planBaseOf, resolvePaymentType, won } from "@/lib/pricing";
import { BADGE } from "@/lib/badge";
import type { GridEvent } from "@/lib/calendarGrid";

export function reservationTotal(r: Reservation) {
  return confirmTotalOf(r);
}

export function toRow(r: Reservation) {
  const badge = BADGE[r.status] ?? BADGE["신규요청"];
  const total = reservationTotal(r);
  const paymentType = resolvePaymentType(r.paymentType, r.paidAmount, total);
  return {
    id: r.id,
    customer: r.customer,
    side: r.side,
    hasCustomerMemo: r.customerMemo !== "",
    venueLine: `${r.confirmPlan} · ${r.confirmVenue}`,
    staffLine: `버틀러 ${r.confirmButlers}명`,
    dateLine: r.confirmDate.replace(/-/g, ". "),
    amountLine: won(total),
    planAmountLine: won(planBaseOf(r)),
    paidAmountLine: won(r.paidAmount),
    onsiteAmountLine: won(onsiteAmount(total, r.paidAmount)),
    paymentTypeLine: paymentType ? PAYMENT_TYPES[paymentType].short : "유형 미지정",
    status: r.status,
    badgeBg: badge.bg,
    badgeColor: badge.color,
  };
}

export function toCalendarEvent(r: Reservation): GridEvent {
  return {
    id: r.id,
    time: r.confirmTime,
    customer: `${r.customer} 님`,
    venue: r.confirmVenue,
    staff: `버틀러 ${r.confirmButlers}명`,
  };
}
