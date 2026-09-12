import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { won } from "@/lib/pricing";
import { reservationTotal, toCalendarEvent } from "@/lib/view";
import MiniCalendar from "@/components/MiniCalendar";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const items = await prisma.reservation.findMany({ orderBy: { requestedAt: "desc" } });

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const today = `${year}-${String(month + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const newCount = items.filter((it) => it.status === "신규요청").length;
  const talkingCount = items.filter((it) => it.status === "협의중").length;
  const confirmedAll = items.filter((it) => it.status === "확정");
  const monthConfirmed = confirmedAll.filter((it) => it.confirmDate.startsWith(monthPrefix));
  const monthAmount = monthConfirmed.reduce((sum, it) => sum + reservationTotal(it), 0);
  const staffTotal = monthConfirmed.reduce((sum, it) => sum + it.confirmButlers, 0);

  const eventsByDate: Record<string, ReturnType<typeof toCalendarEvent>[]> = {};
  for (const it of confirmedAll) {
    if (!eventsByDate[it.confirmDate]) eventsByDate[it.confirmDate] = [];
    eventsByDate[it.confirmDate].push(toCalendarEvent(it));
  }

  const upcoming = confirmedAll
    .slice()
    .sort((a, b) => (a.confirmDate < b.confirmDate ? -1 : 1))
    .slice(0, 4);

  return (
    <main style={{ flex: 1, minWidth: 0, padding: "4px 28px 48px" }}>
      <h1 style={{ margin: "0 0 22px", fontSize: 27, fontWeight: 800, letterSpacing: "-0.7px" }}>대시보드</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(178px, 1fr))", gap: 16, marginBottom: 24 }}>
        <Link href="/reservations?filter=신규요청" style={{ background: "#F7EDF2", borderRadius: 18, padding: "22px 24px", minHeight: 112, display: "block" }}>
          <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.45, color: "#7E3855" }}>신규 요청 {newCount}건<br />확인이 필요해요</div>
          <div style={{ fontSize: 12.5, color: "#9E7286", marginTop: 8 }}>협의 후 확정하면 캘린더에 등록됩니다</div>
        </Link>
        <Link href="/reservations?filter=협의중" style={{ background: "#F2F1EE", borderRadius: 18, padding: "22px 24px", minHeight: 112, display: "block" }}>
          <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.45, color: "#4E4A43" }}>협의 중 {talkingCount}건<br />응답을 기다리고 있어요</div>
          <div style={{ fontSize: 12.5, color: "#8A857C", marginTop: 8 }}>대시보드에서 바로 확인하세요</div>
        </Link>
        <Link href="/reservations?filter=확정" style={{ background: "#EDF0F4", borderRadius: 18, padding: "22px 24px", minHeight: 112, display: "block" }}>
          <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.45, color: "#3E4C5C" }}>이번 달 확정 {monthConfirmed.length}건<br />{won(monthAmount)}</div>
          <div style={{ fontSize: 12.5, color: "#7A8794", marginTop: 8 }}>투입 예정 버틀러 {staffTotal}명</div>
        </Link>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "flex-start" }}>
        <MiniCalendar initialYear={year} initialMonth={month} eventsByDate={eventsByDate} today={today} />

        <div style={{ flex: "1 1 300px", minWidth: 260, borderRadius: 18, background: "#F6F3F5", padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 14 }}>다가오는 확정 일정</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {upcoming.length === 0 && (
              <div style={{ fontSize: 13, color: "#8C8188" }}>확정된 일정이 없습니다.</div>
            )}
            {upcoming.map((it) => (
              <Link key={it.id} href={`/reservations?id=${it.id}`} style={{ display: "flex", gap: 12 }}>
                <div style={{ width: 3, borderRadius: 2, background: "#B0567E", flex: "0 0 3px" }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1E1A1C" }}>{it.confirmDate.slice(5).replace("-", ".")} {it.confirmTime}</div>
                  <div style={{ fontSize: 12.5, color: "#8C8188", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {it.customer} 님 · {it.confirmVenue}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
