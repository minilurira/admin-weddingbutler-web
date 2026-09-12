import type { Reservation } from "@prisma/client";
import { calcConfirm, won } from "@/lib/pricing";
import { BADGE } from "@/lib/badge";
import type { GridEvent } from "@/lib/calendarGrid";

export function reservationTotal(r: Reservation) {
  return calcConfirm({ plan: r.confirmPlan, butlers: r.confirmButlers, extraGuests: r.confirmExtraGuests, discount: r.confirmDiscount }).total;
}

export function toRow(r: Reservation) {
  const badge = BADGE[r.status] ?? BADGE["신규요청"];
  return {
    id: r.id,
    customer: r.customer,
    venueLine: `${r.confirmPlan} · ${r.confirmVenue}`,
    staffLine: `버틀러 ${r.confirmButlers}명`,
    dateLine: r.confirmDate.replace(/-/g, ". "),
    amountLine: won(reservationTotal(r)),
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
