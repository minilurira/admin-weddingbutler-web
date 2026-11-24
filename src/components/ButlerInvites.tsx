"use client";

import { useCallback, useEffect, useState } from "react";
import { cancelInviteAction, getInvites, resendInviteAction, sendInvites } from "@/lib/butlerInviteActions";
import type { InviteRow, InviteState } from "@/lib/butlerInvite";
import type { AssignmentView } from "@/lib/assign";
import { formatStamp } from "@/lib/format";
import { useToast } from "./ToastContext";

const STATE: Record<InviteState, { text: string; bg: string; color: string }> = {
  pending: { text: "응답 대기", bg: "#FBEFD9", color: "#8A5A00" },
  available: { text: "참석 가능", bg: "#E3F1E8", color: "#2B6A45" },
  unavailable: { text: "참석 불가", bg: "#F7E4E4", color: "#A8416C" },
  cancelled: { text: "취소", bg: "#EEECED", color: "#6E646A" },
  expired: { text: "기한 만료 (무응답)", bg: "#EEECED", color: "#6E646A" },
  not_found: { text: "", bg: "#EEECED", color: "#6E646A" },
};

/** 예약 상세 배정 카드 안의 "참석 문의". 후보에게 링크를 보내 참석 가능 여부만 받는다. 배정은 응답을 보고 위/아래 배정 칸에서 직접 한다 (src/lib/butlerInvite.ts). */
export default function ButlerInvites({ reservationId, required, data, onChanged, onPick }: { reservationId: string; required: number; data: AssignmentView; onChanged: () => void; onPick: (butlerId: string) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<InviteRow[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const load = useCallback(() => { getInvites(reservationId).then(setRows).catch(() => setRows([])); }, [reservationId]);
  useEffect(() => { load(); }, [load]);

  const assignedIds = new Set(data.assigned.map((a) => a.butlerId));
  const waiting = new Set(rows.filter((r) => r.state === "pending").map((r) => r.butlerId));
  const candidates = data.butlers.filter((b) => !assignedIds.has(b.id) && !waiting.has(b.id));
  const full = data.assigned.length >= required;

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    try { toast(await fn()); load(); onChanged(); } catch (e) { toast(e instanceof Error ? e.message : "처리하지 못했습니다."); } finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #F4F1F3" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <b style={{ fontSize: 14 }}>참석 문의</b>
        <span style={{ fontSize: 12.5, color: "#A79BA1" }}>후보에게 링크를 보내 참석 가능 여부만 받습니다 (응답 24시간, 발송 후 48시간까지 링크에서 답 변경 가능). 배정은 응답을 보고 직접 합니다.</span>
        <span style={{ flex: 1 }} />
        {!full && <button type="button" onClick={() => setOpen(!open)} style={{ border: 0, background: "transparent", color: "#8A3F61", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{open ? "닫기" : "문의 보내기"}</button>}
      </div>

      {rows.map((r) => {
        const st = STATE[r.state];
        return (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", flexWrap: "wrap", fontSize: 13 }}>
            <b style={{ minWidth: 60 }}>{r.name}</b>
            <span style={{ fontWeight: 700, padding: "2px 9px", borderRadius: 99, fontSize: 12, background: st.bg, color: st.color }}>{st.text}</span>
            {assignedIds.has(r.butlerId) && <span style={{ fontSize: 12, fontWeight: 700, color: "#2B6A45" }}>배정됨</span>}
            <span style={{ fontSize: 12, color: "#A79BA1" }}>{r.respondedAt ? `응답 ${formatStamp(new Date(r.respondedAt))}` : r.sentAt ? `발송 ${formatStamp(new Date(r.sentAt))}` : ""}</span>
            <span style={{ flex: 1 }} />
            {r.state === "available" && !assignedIds.has(r.butlerId) && !full && (
              <button type="button" onClick={() => onPick(r.butlerId)} style={{ border: 0, background: "transparent", color: "#8A3F61", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>배정하기</button>
            )}
            {(r.state === "pending" || r.state === "expired") && (
              <>
                <button type="button" disabled={busy} onClick={() => run(() => resendInviteAction(r.id))} style={{ border: 0, background: "transparent", color: "#8A3F61", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>다시 보내기</button>
                <button type="button" disabled={busy} onClick={() => run(() => cancelInviteAction(r.id))} style={{ border: 0, background: "transparent", color: "#8C8188", fontSize: 12.5, cursor: "pointer" }}>취소</button>
              </>
            )}
          </div>
        );
      })}

      {open && !full && (
        <div style={{ marginTop: 10, padding: 14, borderRadius: 14, background: "#FAF7F9" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "0 0 12px" }}>
            {candidates.length === 0 && <span style={{ fontSize: 12.5, color: "#8C8188" }}>문의할 수 있는 버틀러가 없습니다.</span>}
            {candidates.map((b) => (
              <label key={b.id} style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={picked.includes(b.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, b.id] : picked.filter((x) => x !== b.id))} />
                {b.name}{b.busyAt !== null ? <span style={{ color: "#A0632E" }}> · 같은 날 다른 예약 배정됨{b.busyAt ? ` (${b.busyAt})` : ""}</span> : null}
              </label>
            ))}
          </div>
          <button type="button" disabled={busy || picked.length === 0}
            onClick={() => { if (window.confirm(`${picked.length}명에게 참석 문의를 보낼까요?`)) void run(async () => { const m = await sendInvites({ reservationId, butlerIds: picked }); setPicked([]); setOpen(false); return m; }); }}
            style={{ height: 38, padding: "0 18px", border: 0, borderRadius: 12, background: "#B0567E", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: busy || !picked.length ? 0.6 : 1 }}>알림톡 보내기</button>
        </div>
      )}
    </div>
  );
}
