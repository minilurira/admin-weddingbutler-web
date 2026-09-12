import { prisma } from "@/lib/prisma";
import { toCalendarEvent } from "@/lib/view";
import FullCalendar from "@/components/FullCalendar";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const confirmed = await prisma.reservation.findMany({ where: { status: "확정" } });

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = `${year}-${String(month + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const eventsByDate: Record<string, ReturnType<typeof toCalendarEvent>[]> = {};
  for (const it of confirmed) {
    if (!eventsByDate[it.confirmDate]) eventsByDate[it.confirmDate] = [];
    eventsByDate[it.confirmDate].push(toCalendarEvent(it));
  }

  return <FullCalendar initialYear={year} initialMonth={month} eventsByDate={eventsByDate} today={today} />;
}
