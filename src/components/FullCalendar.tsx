"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/lib/useIsMobile";
import { buildMonthGrid, type GridEvent } from "@/lib/calendarGrid";
import { blockLabel } from "@/lib/calendarBlocks";
import { createCalendarBlocks, deleteCalendarBlock } from "@/lib/blockActions";
import { TIME_SLOTS } from "@/lib/format";
import { useToast } from "./ToastContext";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const WD_KO = ["일", "월", "화", "수", "목", "금", "토"];

export interface CalBlock { id: string; startTime: string; endTime: string; reason: string }

const field: React.CSSProperties = { border: 0, background: "#F6F3F5", borderRadius: 10, height: 40, padding: "0 10px", fontSize: 13.5, color: "#1E1A1C", boxSizing: "border-box", width: "100%" };

export default function FullCalendar({
  initialYear, initialMonth, eventsByDate, blocksByDate = {}, today, embedded = false,
}: {
  initialYear: number;
  initialMonth: number;
  eventsByDate: Record<string, GridEvent[]>;
  blocksByDate?: Record<string, CalBlock[]>;
  today: string;
  /** 대시보드 안에 넣을 때: 바깥 여백·제목 없이 달력만 */
  embedded?: boolean;
}) {
  const mobile = useIsMobile();
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [selected, setSelected] = useState(today);
  const [busy, setBusy] = useState(false);
  // 막기 폼
  const [mode, setMode] = useState<"all" | "time">("all");
  const [startT, setStartT] = useState(TIME_SLOTS[0]);
  const [endT, setEndT] = useState(TIME_SLOTS[TIME_SLOTS.length - 1]);
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");

  const map = useMemo(() => new Map(Object.entries(eventsByDate)), [eventsByDate]);
  const cells = useMemo(() => buildMonthGrid(year, month, map), [year, month, map]);
  const monthEventCount = useMemo(() => cells.reduce((sum, c) => sum + c.events.length, 0), [cells]);

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1);
  }

  const selEvents = eventsByDate[selected] ?? [];
  const selBlocks = blocksByDate[selected] ?? [];
  const selDate = selected ? new Date(`${selected}T00:00:00`) : null;
  const selTitle = selDate ? `${selDate.getMonth() + 1}월 ${selDate.getDate()}일 (${WD_KO[selDate.getDay()]})` : "";

  function addBlock() {
    if (busy) return;
    if (mode === "time" && endT < startT) return toast("끝나는 시간이 시작 시간보다 빠릅니다.");
    setBusy(true);
    start(async () => {
      try {
        const r = await createCalendarBlocks({ from: selected, to: toDate || selected, startTime: mode === "time" ? startT : "", endTime: mode === "time" ? endT : "", reason });
        toast(r.message);
        if (r.ok) { setReason(""); setToDate(""); router.refresh(); }
      } finally { setBusy(false); }
    });
  }

  function removeBlock(id: string) {
    if (busy) return;
    setBusy(true);
    start(async () => {
      try {
        const r = await deleteCalendarBlock(id);
        toast(r.message);
        router.refresh();
      } finally { setBusy(false); }
    });
  }

  const calMinH = mobile ? 78 : embedded ? 104 : 118;

  const calendar = (
    <div style={{ flex: "1 1 560px", minWidth: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: embedded ? 21 : 27, fontWeight: 800, letterSpacing: "-0.7px" }}>{year}년 {month + 1}월</h2>
        <div style={{ display: "flex", gap: 6 }}>
          <button aria-label="이전 달" onClick={prevMonth} style={{ width: 36, height: 36, border: 0, background: "#F6F3F5", borderRadius: 12, color: "#6E646A", fontSize: 15, cursor: "pointer" }}>‹</button>
          <button aria-label="다음 달" onClick={nextMonth} style={{ width: 36, height: 36, border: 0, background: "#F6F3F5", borderRadius: 12, color: "#6E646A", fontSize: 15, cursor: "pointer" }}>›</button>
        </div>
        <span style={{ fontSize: 13.5, color: "#8C8188" }}>확정된 축의대 대행 일정 {monthEventCount}건</span>
      </div>

      <div style={{ borderRadius: 18, border: "1px solid #F0EDEF", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", background: "#FAF8F9" }}>
          {WEEKDAYS.map((w, i) => (
            <div key={w} style={{ padding: mobile ? "10px 6px" : "13px 16px", fontSize: 12.5, fontWeight: 700, color: i === 0 ? "#C4566E" : "#8C8188" }}>{w}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))" }}>
          {cells.map((cell, idx) => {
            const isToday = cell.key === today;
            const isSel = cell.key !== null && cell.key === selected;
            const blocks = cell.key ? blocksByDate[cell.key] ?? [] : [];
            const fullyBlocked = blocks.some((b) => !b.startTime || !b.endTime);
            return (
              <div
                key={idx}
                role={cell.key ? "button" : undefined}
                tabIndex={cell.key ? 0 : undefined}
                aria-label={cell.key ? `${cell.key} 선택` : undefined}
                aria-pressed={cell.key ? isSel : undefined}
                onClick={() => cell.key && setSelected(cell.key)}
                onKeyDown={(e) => { if (cell.key && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setSelected(cell.key); } }}
                style={{
                  minHeight: calMinH, borderTop: "1px solid #F4F1F2", borderRight: "1px solid #F4F1F2",
                  padding: mobile ? 6 : 10, background: isSel ? "#FBF1F6" : fullyBlocked ? "#F5F3F4" : cell.dim ? "#FCFBFB" : "#FFFFFF",
                  display: "flex", flexDirection: "column", gap: 6, cursor: cell.key ? "pointer" : "default",
                  boxShadow: isSel ? "inset 0 0 0 2px #C98AA6" : "none",
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
                {blocks.map((b) => (
                  <div key={b.id} style={{ background: "#E9E5E7", color: "#6E646A", borderRadius: 8, padding: mobile ? "3px 5px" : "5px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {mobile ? "막음" : `막음 · ${blockLabel(b)}`}
                  </div>
                ))}
                {cell.events.map((e) => (
                  <Link key={e.id} href={`/reservations?id=${e.id}`} onClick={(ev) => ev.stopPropagation()} style={{ background: "#F9EFF4", borderRadius: 9, padding: mobile ? "5px 6px" : "7px 9px", display: "block" }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "#8A3F61", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {e.time} {e.customer}
                    </div>
                    {!mobile && (
                      <div style={{ fontSize: 11, color: "#9C7C8B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                        {e.venue} · {e.staff}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const panel = (
    <aside style={{ flex: "0 1 320px", minWidth: 260, borderRadius: 18, background: "#F6F3F5", padding: 20, alignSelf: "flex-start", width: "100%", maxWidth: mobile ? "none" : 340, boxSizing: "border-box" }}>
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>{selTitle}</div>

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#8C8188", marginBottom: 8 }}>예약 {selEvents.length}건</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        {selEvents.length === 0 && <div style={{ fontSize: 13, color: "#9A8F95" }}>확정된 예약이 없어요.</div>}
        {selEvents.map((e) => (
          <Link key={e.id} href={`/reservations?id=${e.id}`} style={{ background: "#FFFFFF", borderRadius: 12, padding: "10px 12px", display: "block" }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#8A3F61" }}>{e.time} · {e.customer} 님</div>
            <div style={{ fontSize: 12, color: "#8C8188", marginTop: 2 }}>{e.venue} · {e.staff}</div>
          </Link>
        ))}
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#8C8188", marginBottom: 8 }}>막아 둔 시간 {selBlocks.length}건</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        {selBlocks.length === 0 && <div style={{ fontSize: 13, color: "#9A8F95" }}>막은 시간이 없어요.</div>}
        {selBlocks.map((b) => (
          <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#FFFFFF", borderRadius: 12, padding: "8px 8px 8px 12px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#4E4A4D" }}>{blockLabel(b)}</div>
              {b.reason && <div style={{ fontSize: 12, color: "#8C8188", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.reason}</div>}
            </div>
            <button type="button" disabled={busy} onClick={() => removeBlock(b.id)} aria-label={`${blockLabel(b)} 막기 풀기`} style={{ height: 34, padding: "0 12px", border: 0, borderRadius: 10, background: "#F1EDEF", color: "#6E646A", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>풀기</button>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid #E6E0E3", paddingTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>이 날 막기</div>
        <p style={{ margin: "0 0 12px", fontSize: 12, lineHeight: 1.6, color: "#8C8188" }}>막은 시간은 홈페이지 예약 화면에서 고를 수 없어요. 이미 받은 예약은 그대로예요.</p>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {([["all", "하루 종일"], ["time", "시간 선택"]] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} style={{ flex: 1, height: 38, border: 0, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", background: mode === k ? "#F9EFF4" : "#FFFFFF", color: mode === k ? "#B0567E" : "#6E646A", boxShadow: mode === k ? "inset 0 0 0 1.5px #C98AA6" : "none" }}>{label}</button>
          ))}
        </div>
        {mode === "time" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <select aria-label="시작 시간" value={startT} onChange={(e) => setStartT(e.target.value)} style={field}>{TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <span style={{ color: "#8C8188" }}>~</span>
            <select aria-label="끝 시간" value={endT} onChange={(e) => setEndT(e.target.value)} style={field}>{TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </div>
        )}
        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#6E646A", marginBottom: 10 }}>
          여러 날 막기 (선택) · 이 날부터 며칠까지
          <input type="date" min={selected} value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ ...field, marginTop: 6 }} />
        </label>
        <input aria-label="사유" value={reason} maxLength={40} onChange={(e) => setReason(e.target.value)} placeholder="사유 (선택) 예: 휴무, 교육" style={{ ...field, marginBottom: 12 }} />
        <button type="button" disabled={busy} onClick={addBlock} style={{ width: "100%", height: 44, border: 0, borderRadius: 12, background: "#B0567E", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "처리 중…" : mode === "all" ? "이 날 종일 막기" : `${startT}~${endT} 막기`}
        </button>
      </div>
    </aside>
  );

  const body = <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "flex-start" }}>{calendar}{panel}</div>;
  if (embedded) return body;
  return <main style={{ flex: 1, minWidth: 0, padding: "4px 28px 48px" }}>{body}</main>;
}
