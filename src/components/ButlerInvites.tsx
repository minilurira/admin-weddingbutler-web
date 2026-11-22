"use client";

import { useCallback, useEffect, useState } from "react";
import { cancelInviteAction, getInvites, resendInviteAction, sendInvites } from "@/lib/butlerInviteActions";
import type { InviteRow, InviteState } from "@/lib/butlerInvite";
import type { AssignmentView } from "@/lib/assign";
import { BUTLER_GRADES, type ButlerGrade } from "@/lib/financeCalc";
import { deskSideOptions } from "@/lib/pricing";
import { formatStamp } from "@/lib/format";
import { useToast } from "./ToastContext";

const GRADES = Object.keys(BUTLER_GRADES) as ButlerGrade[];
const selectStyle: React.CSSProperties = { border: 0, background: "#F6F3F5", borderRadius: 10, padding: "9px 10px", fontSize: 13, color: "#1E1A1C", minWidth: 0 };
const STATE: Record<InviteState, { text: string; bg: string; color: string }> = {
  pending: { text: "응답 대기", bg: "#FBEFD9", color: "#8A5A00" },
  accepted: { text: "참석 확정", bg: "#E3F1E8", color: "#2B6A45" },
  declined: { text: "불참", bg: "#F7E4E4", color: "#A8416C" },
  closed: { text: "마감", bg: "#EEECED", color: "#6E646A" },
  cancelled: { text: "취소", bg: "#EEECED", color: "#6E646A" },
  expired: { text: "기한 만료", bg: "#EEECED", color: "#6E646A" },
  wait: { text: "대기", bg: "#EEECED", color: "#6E646A" },
  not_found: { text: "", bg: "#EEECED", color: "#6E646A" },
};

/** 예약 상세 배정 카드 안의 "참석 문의". 후보에게 링크를 보내 선착순으로 확정한다 (src/lib/butlerInvite.ts). */
export default function ButlerInvites({ reservationId, required, data, onChanged }: { reservationId: string; required: number; data: AssignmentView; onChanged: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<InviteRow[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [grade, setGrade] = useState<ButlerGrade>("owner");
  const [side, setSide] = useState("");
  const [need, setNeed] = useState(1);
  const [picked, setPicked] = useState<string[]>([]);

  const load = useCallback(() => { getInvites(reservationId).then(setRows).catch(() => setRows([])); }, [reservationId]);
  useEffect(() => { load(); }, [load]);

  const remaining = Math.max(0, required - data.assigned.length);
  const hasOwner = data.assigned.some((a) => a.grade === "owner");
  const sideOptions = deskSideOptions(data.side, data.plan);
  const sideValue = sideOptions.includes(side as never) ? side : sideOptions[0] === "양가 통합" ? "양가 통합" : "";
  const waiting = new Set(rows.filter((r) => r.state === "pending").map((r) => r.butlerId));
  const candidates = data.butlers.filter((b) => !data.assigned.some((a) => a.butlerId === b.id) && !waiting.has(b.id));
  const blocked = grade !== "owner" && !hasOwner ? "오너 버틀러가 배정된 뒤에 스태프·매니저에게 문의할 수 있습니다." : sideOptions.length > 0 && !sideValue ? "맡을 쪽을 골라 주세요." : "";

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    try { toast(await fn()); load(); onChanged(); } catch (e) { toast(e instanceof Error ? e.message : "처리하지 못했습니다."); } finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #F4F1F3" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <b style={{ fontSize: 14 }}>참석 문의</b>
        <span style={{ fontSize: 12.5, color: "#A79BA1" }}>후보에게 링크를 보내면 먼저 참석을 누른 사람이 확정됩니다 (응답 24시간).</span>
        <span style={{ flex: 1 }} />
        {remaining > 0 && <button type="button" onClick={() => setOpen(!open)} style={{ border: 0, background: "transparent", color: "#8A3F61", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{open ? "닫기" : "문의 보내기"}</button>}
      </div>

      {rows.map((r) => {
        const st = STATE[r.state];
        const g = BUTLER_GRADES[r.grade as ButlerGrade]?.label.replace(" 버틀러", "") ?? r.grade;
        return (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", flexWrap: "wrap", fontSize: 13 }}>
            <b style={{ minWidth: 60 }}>{r.name}</b>
            <span style={{ color: "#6E646A" }}>{g}{r.side ? `·${r.side}` : ""} · {r.need}명 모집</span>
            <span style={{ fontWeight: 700, padding: "2px 9px", borderRadius: 99, fontSize: 12, background: st.bg, color: st.color }}>{st.text}</span>
            {r.sentAt && <span style={{ fontSize: 12, color: "#A79BA1" }}>발송 {formatStamp(new Date(r.sentAt))}</span>}
            <span style={{ flex: 1 }} />
            {(r.state === "pending" || r.state === "expired") && (
              <>
                <button type="button" disabled={busy} onClick={() => run(() => resendInviteAction(r.id))} style={{ border: 0, background: "transparent", color: "#8A3F61", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>다시 보내기</button>
                <button type="button" disabled={busy} onClick={() => run(() => cancelInviteAction(r.id))} style={{ border: 0, background: "transparent", color: "#8C8188", fontSize: 12.5, cursor: "pointer" }}>취소</button>
              </>
            )}
          </div>
        );
      })}

      {open && remaining > 0 && (
        <div style={{ marginTop: 10, padding: 14, borderRadius: 14, background: "#FAF7F9" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select style={selectStyle} value={grade} onChange={(e) => setGrade(e.target.value as ButlerGrade)} aria-label="문의 등급">
              {GRADES.map((g) => <option key={g} value={g}>{BUTLER_GRADES[g].label}</option>)}
            </select>
            {sideOptions.length > 0 && (
              <select style={selectStyle} value={sideValue} onChange={(e) => setSide(e.target.value)} aria-label="맡을 쪽">
                {!sideValue && <option value="">담당 선택</option>}
                {sideOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <label style={{ fontSize: 13, color: "#6E646A" }}>모집 <input type="number" min={1} max={remaining} value={need} onChange={(e) => setNeed(Math.max(1, Number(e.target.value) || 1))} style={{ ...selectStyle, width: 56 }} />명 (남은 자리 {remaining}명)</label>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
            {candidates.length === 0 && <span style={{ fontSize: 12.5, color: "#8C8188" }}>문의할 수 있는 버틀러가 없습니다.</span>}
            {candidates.map((b) => (
              <label key={b.id} style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={picked.includes(b.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, b.id] : picked.filter((x) => x !== b.id))} />
                {b.name}{b.busyAt !== null ? <span style={{ color: "#A0632E" }}> · 같은 날 다른 예약 배정됨{b.busyAt ? ` (${b.busyAt})` : ""}</span> : null}
              </label>
            ))}
          </div>
          {blocked && <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "#A0632E" }}>{blocked}</p>}
          <button type="button" disabled={busy || !!blocked || picked.length === 0}
            onClick={() => { if (window.confirm(`${picked.length}명에게 참석 문의를 보낼까요?`)) void run(async () => { const m = await sendInvites({ reservationId, grade, side: sideValue, need, butlerIds: picked }); setPicked([]); setOpen(false); return m; }); }}
            style={{ height: 38, padding: "0 18px", border: 0, borderRadius: 12, background: "#B0567E", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: busy || blocked || !picked.length ? 0.6 : 1 }}>알림톡 보내기</button>
        </div>
      )}
    </div>
  );
}
