import { prisma } from "@/lib/prisma";
import { toCalendarEvent } from "@/lib/view";
import FullCalendar from "@/components/FullCalendar";
import { blocksByDate } from "@/lib/blockData";
import { calendarStatus } from "@/lib/googleCalendar";
import GoogleCalendarStatus from "@/components/GoogleCalendarStatus";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const [confirmed, blocks, gcal] = await Promise.all([prisma.reservation.findMany({ where: { status: "확정" } }), blocksByDate(), calendarStatus()]);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = `${year}-${String(month + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const eventsByDate: Record<string, ReturnType<typeof toCalendarEvent>[]> = {};
  for (const it of confirmed) {
    if (!eventsByDate[it.confirmDate]) eventsByDate[it.confirmDate] = [];
    eventsByDate[it.confirmDate].push(toCalendarEvent(it));
  }

  return (
    <>
      <GoogleCalendarStatus missing={gcal.missing} pending={gcal.pending} registered={gcal.registered} calendars={gcal.calendars} />
      <FullCalendar initialYear={year} initialMonth={month} eventsByDate={eventsByDate} blocksByDate={blocks} today={today} />
    </>
  );
}
