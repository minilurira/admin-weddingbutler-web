"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { buildMonthGrid, type GridEvent } from "@/lib/calendarGrid";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function MiniCalendar({
  initialYear, initialMonth, eventsByDate, today,
}: {
  initialYear: number;
  initialMonth: number;
  eventsByDate: Record<string, GridEvent[]>;
  today: string;
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);

  const map = useMemo(() => new Map(Object.entries(eventsByDate)), [eventsByDate]);
  const cells = useMemo(() => buildMonthGrid(year, month, map), [year, month, map]);

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1);
  }

  return (
    <div style={{ flex: "1 1 300px", minWidth: 260, borderRadius: 18, background: "#FFFFFF", border: "1px solid #F0EDEF", padding: "18px 18px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.4px" }}>{year}.{month + 1}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button onClick={prevMonth} style={{ width: 28, height: 28, border: 0, background: "transparent", color: "#8C8188", fontSize: 15 }}>‹</button>
          <button onClick={nextMonth} style={{ width: 28, height: 28, border: 0, background: "transparent", color: "#8C8188", fontSize: 15 }}>›</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px 0" }}>
        {WEEKDAYS.map((w, i) => (
          <div key={w} style={{ height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: i === 0 ? "#C4566E" : "#8C8188" }}>
            {w}
          </div>
        ))}
        {cells.map((cell, idx) => {
          const isToday = cell.key === today;
          const hasEvents = cell.events.length > 0;
          const href = hasEvents ? `/reservations?id=${cell.events[0].id}` : "/calendar";
          return (
            <Link
              key={idx}
              href={href}
              style={{ height: 38, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 10 }}
            >
              <span
                style={{
                  width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: hasEvents ? 700 : 500,
                  color: isToday ? "#FFFFFF" : cell.dim ? "#CFC8CC" : cell.dow === 0 ? "#C4566E" : "#413A3E",
                  background: isToday ? "#B0567E" : "transparent",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {cell.num}
              </span>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: hasEvents ? "#B0567E" : "transparent" }} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
