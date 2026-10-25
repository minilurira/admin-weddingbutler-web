"use client";

import { useCallback, useEffect, useState } from "react";
import { claimExtraGuests, getExtraGuest } from "@/lib/extraGuestActions";
import type { ExtraGuestView } from "@/lib/extraGuest";
import { extraGuestDue, won } from "@/lib/pricing";
import { useToast } from "./ToastContext";

const input: React.CSSProperties = { border: 0, background: "#F6F3F5", borderRadius: 10, padding: "9px 12px", fontSize: 14, color: "#1E1A1C", width: 120 };
const STATUS: Record<string, string> = { sent: "결제 대기", paid: "결제 완료", cancelled: "취소" };

/** 예약 상세의 "추가 하객 차액 청구" 카드. 예식 후 실제 접수 인원을 넣으면 기준 초과 인원 × 2,000원에서 이미 낸 금액을 뺀 차액을 결제 링크로 보낸다. */
export default function ExtraGuestClaim({ reservationId, card }: { reservationId: string; card: React.CSSProperties }) {
  const toast = useToast();
  const [data, setData] = useState<ExtraGuestView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actual, setActual] = useState("");

  const load = useCallback(() => {
    getExtraGuest(reservationId).then((d) => { setData(d); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "불러오지 못했습니다."));
  }, [reservationId]);
  useEffect(() => { setData(null); load(); }, [load]);

  const n = Number(actual.replace(/[^0-9]/g, "")) || 0;
  const due = data ? extraGuestDue({ actualGuests: n, guestLimit: data.guestLimit, billedExtraGuests: data.billedExtraGuests, paidClaim: data.paidClaim }) : null;

  async function send() {
    if (!data || !due) return;
    if (!window.confirm(`실제 접수 ${n}명 기준으로 ${won(due.amount)} 결제 링크를 고객에게 보낼까요?`)) return;
    setBusy(true);
    try { const res = await claimExtraGuests(reservationId, n); toast(res.message); load(); } catch (e) { toast(e instanceof Error ? e.message : "처리하지 못했습니다."); } finally { setBusy(false); }
  }

  return (
    <section style={card}>
      <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>추가 하객 차액 청구</h2>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#A79BA1" }}>예식 후 실제 접수 인원이 기준을 넘으면 초과 인원 × 2,000원에서 이미 낸 금액을 뺀 차액을 결제 링크로 청구합니다.</p>
      {error && <p style={{ margin: 0, fontSize: 13, color: "#A8416C" }}>{error}</p>}
      {!data && !error && <p style={{ margin: 0, fontSize: 13, color: "#A79BA1" }}>불러오는 중…</p>}
      {data && !data.eligible && <p style={{ margin: 0, fontSize: 13, color: "#8C8188" }}>{data.reason}</p>}
      {data && data.eligible && (
        <>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6E646A" }}>
            {data.plan} 기준 하객 {data.guestLimit}명 · 예약 때 신청 {data.declaredLabel || "-"} · 예약 때 낸 추가 하객 {data.billedExtraGuests}명{data.paidClaim ? ` · 결제된 차액 ${won(data.paidClaim)}` : ""}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#6E646A", display: "flex", alignItems: "center", gap: 8 }}>실제 접수 인원
              <input inputMode="numeric" value={actual} onChange={(e) => setActual(e.target.value.replace(/[^0-9]/g, ""))} placeholder="예: 130" style={input} />명
            </label>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: due && due.amount > 0 ? "#B0567E" : "#A79BA1" }}>
              {n ? (due && due.amount > 0 ? `청구 차액 ${won(due.amount)}` : "청구할 차액 없음") : ""}
            </span>
            <button disabled={busy || !due || due.amount <= 0} onClick={send}
              style={{ marginLeft: "auto", height: 40, padding: "0 16px", border: 0, borderRadius: 12, background: "#B0567E", color: "#FFFFFF", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: busy || !due || due.amount <= 0 ? 0.5 : 1 }}>
              차액 청구 링크 보내기
            </button>
          </div>
          {data.claims.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
              {data.claims.map((c) => (
                <div key={c.id} style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", padding: "10px 12px", borderRadius: 12, border: "1px solid #EFEBED", fontSize: 13 }}>
                  <b>{won(c.amount)}</b><span style={{ color: "#8C8188" }}>{STATUS[c.status] ?? c.status} · 발송 {c.createdLabel}{c.paidLabel ? ` · 결제 ${c.paidLabel}` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
