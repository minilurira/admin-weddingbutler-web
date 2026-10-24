"use client";

import { useCallback, useEffect, useState } from "react";
import { assignButler, getAssignment, unassignButler } from "@/lib/assignActions";
import type { AssignmentView } from "@/lib/assign";
import { updateShiftGrade } from "@/lib/financeActions";
import { BUTLER_GRADES, shiftTotal, type ButlerGrade } from "@/lib/financeCalc";
import { won } from "@/lib/pricing";
import { useToast } from "./ToastContext";

const GRADES = Object.keys(BUTLER_GRADES) as ButlerGrade[];
const selectStyle: React.CSSProperties = { border: 0, background: "#F6F3F5", borderRadius: 10, padding: "9px 10px", fontSize: 13, color: "#1E1A1C", minWidth: 0 };

/** 예약 상세의 "버틀러 배정" 카드. 필요한 인원(예약 내역의 배정 버틀러 수)만큼 실제 버틀러를 정한다. */
export default function ButlerAssign({ reservationId, required, cancelled, card }: { reservationId: string; required: number; cancelled: boolean; card: React.CSSProperties }) {
  const toast = useToast();
  const [data, setData] = useState<AssignmentView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState("");
  const [pickGrade, setPickGrade] = useState("");

  const load = useCallback(() => {
    getAssignment(reservationId).then((d) => { setData(d); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "배정 정보를 불러오지 못했습니다."));
  }, [reservationId]);
  useEffect(() => { setData(null); load(); }, [load]);

  async function run(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    try { await fn(); toast(okMsg); load(); } catch (e) { toast(e instanceof Error ? e.message : "처리하지 못했습니다."); } finally { setBusy(false); }
  }

  const assigned = data?.assigned ?? [];
  const free = (data?.butlers ?? []).filter((b) => !assigned.some((a) => a.butlerId === b.id));
  const sel = free.find((b) => b.id === pick) ?? free[0];
  const grade = pickGrade || sel?.grade || "staff";
  const full = assigned.length >= required;
  const total = assigned.reduce((a, s) => a + shiftTotal(s), 0);

  return (
    <section style={card}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>버틀러 배정</h2>
          <p style={{ margin: 0, fontSize: 12.5, color: "#A79BA1" }}>배정하면 버틀러 관리의 참석·정산 기록에 자동으로 들어갑니다.</p>
        </div>
        {data && (
          <span style={{ padding: "4px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, background: full ? "#E3F1E8" : "#FBEFD9", color: full ? "#2B6A45" : "#8A5A00" }}>
            {assigned.length} / {required}명 {full ? "배정 완료" : "배정 필요"}
          </span>
        )}
      </div>

      {error && <p style={{ margin: 0, color: "#A8416C", fontWeight: 600, fontSize: 13 }}>{error}</p>}
      {!data && !error && <p style={{ margin: 0, color: "#8C8188", fontSize: 13 }}>불러오는 중…</p>}

      {data && (
        <>
          {assigned.length === 0 && <p style={{ margin: "0 0 12px", color: "#8C8188", fontSize: 13 }}>아직 배정된 버틀러가 없습니다.</p>}
          {assigned.map((a) => (
            <div key={a.shiftId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #F4F1F3", flexWrap: "wrap" }}>
              <b style={{ minWidth: 70, fontSize: 14 }}>{a.name}</b>
              <select style={selectStyle} value={a.grade} disabled={busy || a.paid} aria-label={`${a.name} 등급`}
                onChange={(e) => run(() => updateShiftGrade(a.shiftId, e.target.value), "등급을 바꿨습니다.")}>
                {GRADES.map((g) => <option key={g} value={g}>{BUTLER_GRADES[g].label}</option>)}
              </select>
              <span style={{ fontSize: 13, color: "#6E646A", fontVariantNumeric: "tabular-nums" }}>
                {won(shiftTotal(a))}{a.extra ? ` (스페셜 차지 ${won(a.extra)} 포함)` : ""}
              </span>
              {a.paid && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#2B6A45", background: "#E3F1E8", padding: "2px 9px", borderRadius: 99 }}>지급 완료</span>}
              <span style={{ flex: 1 }} />
              <button type="button" disabled={busy || a.paid} onClick={() => { if (window.confirm(`${a.name} 님의 배정을 해제할까요? 정산 기록도 함께 지워집니다.`)) void run(() => unassignButler(a.shiftId), "배정을 해제했습니다."); }}
                style={{ border: 0, background: "transparent", color: "#8C8188", fontSize: 12.5, cursor: a.paid ? "default" : "pointer", opacity: a.paid ? 0.4 : 1 }}>해제</button>
            </div>
          ))}
          {assigned.length > 0 && <div style={{ padding: "10px 0 0", fontSize: 13, color: "#6E646A" }}>정산 예정 합계 <b style={{ color: "#B0567E" }}>{won(total)}</b></div>}

          {cancelled ? (
            <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "#8C8188" }}>취소된 예약에는 새로 배정할 수 없습니다. 배정되어 있던 버틀러는 위에서 해제해 주세요.</p>
          ) : !data.date ? (
            <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "#8C8188" }}>예식 날짜가 정해지면 배정할 수 있습니다.</p>
          ) : free.length === 0 ? (
            <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "#8C8188" }}>{(data.butlers.length === 0) ? "버틀러 관리에서 버틀러를 먼저 추가해 주세요." : "배정할 수 있는 다른 버틀러가 없습니다."}</p>
          ) : (
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
              <select style={{ ...selectStyle, flex: "1 1 190px" }} value={sel?.id ?? ""} onChange={(e) => { setPick(e.target.value); setPickGrade(""); }} aria-label="배정할 버틀러">
                {free.map((b) => <option key={b.id} value={b.id}>{b.name}{b.busyAt !== null ? ` · 같은 날 다른 예약 배정됨${b.busyAt ? ` (${b.busyAt})` : ""}` : ""}</option>)}
              </select>
              <select style={selectStyle} value={grade} onChange={(e) => setPickGrade(e.target.value)} aria-label="이번 참석 등급">
                {GRADES.map((g) => <option key={g} value={g}>{BUTLER_GRADES[g].label} · {won(BUTLER_GRADES[g].pay)}</option>)}
              </select>
              <button type="button" disabled={busy || !sel} onClick={() => sel && run(() => assignButler(reservationId, sel.id, grade), `${sel.name} 님을 배정했습니다.`)}
                style={{ height: 38, padding: "0 18px", border: 0, borderRadius: 12, background: "#B0567E", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.7 : 1 }}>배정</button>
            </div>
          )}
          {sel && sel.busyAt !== null && !cancelled && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#A0632E" }}>{sel.name} 님은 같은 날 다른 예약에 이미 배정되어 있습니다. 시간이 겹치지 않는지 확인해 주세요.</p>}
        </>
      )}
    </section>
  );
}
