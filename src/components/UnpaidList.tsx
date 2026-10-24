"use client";

import Link from "next/link";
import { useState } from "react";
import { won } from "@/lib/pricing";
import { formatStamp } from "@/lib/format";
import type { UnpaidRow, UnpaidStage } from "@/lib/unpaid";
import { useToast } from "./ToastContext";

const STAGE: Record<UnpaidStage, { bg: string; color: string; order: number; short: string }> = {
  paid_unconfirmed: { bg: "#A8416C", color: "#FFFFFF", order: 0, short: "확정 누락" },
  failed: { bg: "#FBEFD9", color: "#8A5A00", order: 1, short: "결제 실패" },
  in_progress: { bg: "#FBEFD9", color: "#8A5A00", order: 2, short: "진행 중 중단" },
  window_closed: { bg: "#F7EDF2", color: "#A8416C", order: 3, short: "결제창 이탈" },
  before_window: { bg: "#EDF0F4", color: "#3E4C5C", order: 4, short: "결제창 전 이탈" },
  vbank_unpaid: { bg: "#F2F1EE", color: "#4E4A43", order: 5, short: "가상계좌 미입금" },
  cancelled: { bg: "#EEECED", color: "#8A8487", order: 6, short: "결제 후 취소" },
  other: { bg: "#EEECED", color: "#8A8487", order: 7, short: "기타" },
};

/** "2026-11-14 13:00" → "2026년 11월 14일 13:00" */
const ceremonyLabel = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})\s*(.*)$/.exec(v);
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일 ${m[4]}`.trim() : v;
};

const ago = (iso: string) => {
  const m = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
  if (m < 60) return `${m}분 전`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}시간 전`;
  return `${Math.floor(m / 1440)}일 전`;
};

export default function UnpaidList({ rows, failed, days, dayOptions }: { rows: UnpaidRow[]; failed: { bookingNo: string; message: string }[]; days: number; dayOptions: number[] }) {
  const toast = useToast();
  const [hideTest, setHideTest] = useState(true);
  const [stage, setStage] = useState<UnpaidStage | "all">("all");

  const base = rows.filter((r) => !(hideTest && r.isTest));
  const testCount = rows.length - base.length;
  const counts = base.reduce<Record<string, number>>((m, r) => ((m[r.stage] = (m[r.stage] ?? 0) + 1), m), {});
  const shown = base.filter((r) => stage === "all" || r.stage === stage)
    .sort((a, b) => STAGE[a.stage].order - STAGE[b.stage].order || b.createdAt.localeCompare(a.createdAt));
  const urgent = counts.paid_unconfirmed ?? 0;

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast("연락처를 복사했습니다."); } catch { window.prompt("연락처를 복사하세요.", text); }
  }

  const chip = (active: boolean): React.CSSProperties => ({ height: 36, padding: "0 14px", border: 0, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", background: active ? "#F9EFF4" : "#F6F3F5", color: active ? "#B0567E" : "#6E646A" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 27, fontWeight: 800, letterSpacing: "-0.7px" }}>미결제 예약</h1>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#B0567E" }}>{base.length}건</span>
        <Link href="/reservations" style={{ marginLeft: "auto", fontSize: 13.5, fontWeight: 700 }}>← 예약 리스트</Link>
      </div>
      <p style={{ margin: 0, fontSize: 13.5, color: "#6E646A", lineHeight: 1.7 }}>
        예약 정보를 입력하고 &quot;결제하기&quot;까지 눌렀지만 결제를 끝내지 못한 고객입니다. 결제가 확인되기 전에는 예약 리스트에 들어오지 않습니다. 결제하기를 누르기 전에 나간 고객은 기록이 남지 않습니다.
      </p>

      {urgent > 0 && (
        <div style={{ background: "#A8416C", color: "#fff", borderRadius: 14, padding: "12px 16px", fontWeight: 700, fontSize: 14 }}>
          결제는 완료됐는데 예약이 확정 처리되지 않은 건이 {urgent}건 있습니다. 아래 &quot;확정 누락&quot;을 바로 확인해 주세요.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" style={chip(stage === "all")} onClick={() => setStage("all")}>전체 {base.length}</button>
        {(Object.keys(STAGE) as UnpaidStage[]).filter((s) => counts[s]).sort((a, b) => STAGE[a].order - STAGE[b].order).map((s) => (
          <button key={s} type="button" style={chip(stage === s)} onClick={() => setStage(s)}>{STAGE[s].short} {counts[s]}</button>
        ))}
        <span style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6E646A", fontWeight: 600 }}>
          <input type="checkbox" checked={hideTest} onChange={(e) => setHideTest(e.target.checked)} />
          테스트 거래 숨기기{testCount ? ` (${testCount}건)` : ""}
        </label>
        <span style={{ display: "flex", gap: 4 }}>
          {dayOptions.map((d) => (
            <Link key={d} href={`/reservations/unpaid?days=${d}`} style={{ ...chip(d === days), display: "inline-flex", alignItems: "center" }}>{d}일</Link>
          ))}
        </span>
      </div>

      <div style={{ overflowX: "auto", background: "#F8F6F7", borderRadius: 18, padding: "8px 16px 12px" }}>
        <table style={{ width: "100%", minWidth: 860, borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#8C8188", fontSize: 12.5 }}>
              {["접수", "고객", "예식", "요금제 · 금액", "이탈 단계"].map((h) => <th key={h} style={{ padding: "10px 10px", fontWeight: 600, borderBottom: "1px solid #ECE7E9", whiteSpace: "nowrap" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={5} style={{ padding: "22px 10px", color: "#8C8188" }}>해당하는 미결제 예약이 없습니다.</td></tr>}
            {shown.map((r) => {
              const st = STAGE[r.stage];
              return (
                <tr key={r.bookingNo} style={{ borderBottom: "1px solid #ECE7E9", verticalAlign: "top" }}>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap" }}>
                    {formatStamp(new Date(r.createdAt))}<br />
                    <small style={{ color: r.recent ? "#A8416C" : "#8C8188", fontWeight: r.recent ? 700 : 400 }}>{r.recent ? "방금 · " : ""}{ago(r.createdAt)}</small>
                  </td>
                  <td style={{ padding: "12px 10px" }}>
                    <b>{r.name}</b>{r.isTest && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: "#8C8188", background: "#EEECED", padding: "1px 7px", borderRadius: 99 }}>테스트</span>}<br />
                    <button type="button" onClick={() => copy(r.phone)} title="누르면 복사" style={{ border: 0, background: "transparent", padding: 0, color: "#B0567E", fontWeight: 700, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>{r.phone}</button><br />
                    <small style={{ color: "#8C8188" }}>{r.bookingNo}</small>
                  </td>
                  <td style={{ padding: "12px 10px" }}>
                    {ceremonyLabel(r.ceremony)}<br />
                    <small style={{ color: "#8C8188" }}>{r.venue || "예식장 미입력"} · 하객 {r.guests}명</small>
                  </td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap" }}>
                    {r.plan}{r.special && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: "#8A3F61" }}>링크</span>}<br />
                    <b>{won(r.amount)}</b>{r.totalAmount !== r.amount && <small style={{ color: "#8C8188" }}> / 총 {won(r.totalAmount)}</small>}
                  </td>
                  <td style={{ padding: "12px 10px", minWidth: 250 }}>
                    <span style={{ display: "inline-block", padding: "3px 11px", borderRadius: 99, fontSize: 12, fontWeight: 700, background: st.bg, color: st.color }}>{r.stageLabel}</span>
                    <div style={{ marginTop: 6, fontSize: 12.5, color: "#6E646A", lineHeight: 1.6 }}>{r.hint}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {failed.length > 0 && <p style={{ margin: 0, fontSize: 12.5, color: "#8C8188" }}>포트원 조회에 실패해 단계를 알 수 없는 예약 {failed.length}건: {failed.map((f) => f.bookingNo).join(", ")}</p>}
    </div>
  );
}
