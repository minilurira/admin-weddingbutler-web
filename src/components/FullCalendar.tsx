"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useIsMobile } from "@/lib/useIsMobile";
import { buildMonthGrid, type GridEvent } from "@/lib/calendarGrid";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function FullCalendar({
  initialYear, initialMonth, eventsByDate, today,
}: {
  initialYear: number;
  initialMonth: number;
  eventsByDate: Record<string, GridEvent[]>;
  today: string;
}) {
  const mobile = useIsMobile();
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);

  const map = useMemo(() => new Map(Object.entries(eventsByDate)), [eventsByDate]);
  const cells = useMemo(() => buildMonthGrid(year, month, map), [year, month, map]);
  const monthEventCount = useMemo(() => cells.reduce((sum, c) => sum + c.events.length, 0), [cells]);

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1);
  }

  const calMinH = mobile ? 78 : 118;

  return (
    <main style={{ flex: 1, minWidth: 0, padding: "4px 28px 48px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 27, fontWeight: 800, letterSpacing: "-0.7px" }}>{year}년 {month + 1}월</h1>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={prevMonth} style={{ width: 36, height: 36, border: 0, background: "#F6F3F5", borderRadius: 12, color: "#6E646A", fontSize: 15 }}>‹</button>
          <button onClick={nextMonth} style={{ width: 36, height: 36, border: 0, background: "#F6F3F5", borderRadius: 12, color: "#6E646A", fontSize: 15 }}>›</button>
        </div>
        <span style={{ fontSize: 13.5, color: "#8C8188" }}>확정된 축의대 대행 일정 {monthEventCount}건</span>
      </div>

      <div style={{ borderRadius: 18, border: "1px solid #F0EDEF", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", background: "#FAF8F9" }}>
          {WEEKDAYS.map((w, i) => (
            <div key={w} style={{ padding: "13px 16px", fontSize: 12.5, fontWeight: 700, color: i === 0 ? "#C4566E" : "#8C8188" }}>{w}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))" }}>
          {cells.map((cell, idx) => {
            const isToday = cell.key === today;
            return (
              <div
                key={idx}
                style={{
                  minHeight: calMinH, borderTop: "1px solid #F4F1F2", borderRight: "1px solid #F4F1F2",
                  padding: 10, background: cell.dim ? "#FCFBFB" : "#FFFFFF", display: "flex", flexDirection: "column", gap: 6,
                }}
              >
                <span
                  style={{
                    width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12.5, fontWeight: 700,
                    color: isToday ? "#FFFFFF" : cell.dim ? "#CFC8CC" : cell.dow === 0 ? "#C4566E" : "#5C5358",
                    background: isToday ? "#B0567E" : "transparent",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {cell.num}
                </span>
                {cell.events.map((e) => (
                  <Link key={e.id} href={`/reservations?id=${e.id}`} style={{ background: "#F9EFF4", borderRadius: 9, padding: "7px 9px", display: "block" }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "#8A3F61", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {e.time} {e.customer}
                    </div>
                    <div style={{ fontSize: 11, color: "#9C7C8B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                      {e.venue} · {e.staff}
                    </div>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
