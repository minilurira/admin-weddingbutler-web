"use client";

import { useCallback, useEffect, useState } from "react";
import { claimExtraGuests, getExtraGuest } from "@/lib/extraGuestActions";
import type { ExtraGuestView } from "@/lib/extraGuest";
import { EXTRA_GUEST_FEE, won } from "@/lib/pricing";
import { useToast } from "./ToastContext";

const input: React.CSSProperties = { border: 0, background: "#F6F3F5", borderRadius: 10, padding: "9px 12px", fontSize: 14, color: "#1E1A1C", width: 120 };
const STATUS: Record<string, string> = { sent: "결제 대기", paid: "결제 완료", cancelled: "취소" };

/** 예약 상세의 "추가 하객 차액 청구" 카드. 청구할 추가 인원을 넣으면 인원 × 2,000원을 결제 링크로 보낸다(잔금이 남았으면 잔금도 함께). */
export default function ExtraGuestClaim({ reservationId, card }: { reservationId: string; card: React.CSSProperties }) {
  const toast = useToast();
  const [data, setData] = useState<ExtraGuestView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actual, setActual] = useState("");
  // 남은 잔금(예약금만 낸 고객)이 있으면 기본으로 잔금도 함께 청구한다
  const [withBalance, setWithBalance] = useState(true);

  const load = useCallback(() => {
    getExtraGuest(reservationId).then((d) => { setData(d); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "불러오지 못했습니다."));
  }, [reservationId]);
  useEffect(() => { setData(null); load(); }, [load]);

  const n = Number(actual.replace(/[^0-9]/g, "")) || 0;
  const diff = n * EXTRA_GUEST_FEE;
  const hasBalance = !!data && data.balance > 0;
  const balance = hasBalance && withBalance ? data!.balance : 0;
  const total = diff + balance;

  // 문자가 안 갔을 때 카톡 등으로 직접 보낼 수 있게 (예식일이 지나도 쓸 수 있다)
  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); toast("결제 링크를 복사했습니다."); } catch { window.prompt("결제 링크", url); }
  }

  async function send(smsOnly = false) {
    if (!data || total <= 0) return;
    const what = [balance ? `잔금 ${won(balance)}` : "", diff ? `추가 하객 차액 ${won(diff)}` : ""].filter(Boolean).join(" + ");
    if (!window.confirm(`${n ? `추가 인원 ${n}명 ` : ""}${what}${balance && diff ? ` = ${won(total)}` : ""} 결제 링크를 고객에게 ${smsOnly ? "문자로" : "알림톡으로"} 보낼까요?`)) return;
    setBusy(true);
    try { const res = await claimExtraGuests(reservationId, n, balance > 0, smsOnly); toast(res.message); load(); } catch (e) { toast(e instanceof Error ? e.message : "처리하지 못했습니다."); } finally { setBusy(false); }
  }

  return (
    <section style={card}>
      <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>추가 하객 차액 청구</h2>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#A79BA1" }}>청구할 추가 인원을 넣으면 인원 × 2,000원을 결제 링크로 청구합니다. 이미 청구한 인원은 빼고 넣어 주세요. 잔금이 남은 고객은 잔금도 함께 담을 수 있어요.</p>
      {error && <p style={{ margin: 0, fontSize: 13, color: "#A8416C" }}>{error}</p>}
      {!data && !error && <p style={{ margin: 0, fontSize: 13, color: "#A79BA1" }}>불러오는 중…</p>}
      {data && !data.eligible && <p style={{ margin: 0, fontSize: 13, color: "#8C8188" }}>{data.reason}</p>}
      {data && data.eligible && (
        <>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6E646A" }}>
            {data.plan} 기준 하객 {data.guestLimit}명 · 예약 때 신청 {data.declaredLabel || "-"} · 청구된 추가 하객 {data.billedExtraGuests}명{data.paidClaim ? ` · 결제된 차액 ${won(data.paidClaim)}` : ""}
          </p>
          {hasBalance && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px", padding: "10px 12px", borderRadius: 12, background: "#F8F6F7", fontSize: 13, color: "#413A3E", cursor: "pointer" }}>
              <input type="checkbox" checked={withBalance} onChange={(e) => setWithBalance(e.target.checked)} style={{ width: 16, height: 16, accentColor: "#B0567E" }} />
              <span><b>잔금도 함께 청구</b> · 남은 잔금 {won(data.balance)}{data.paymentTypeLabel ? ` (${data.paymentTypeLabel})` : ""}<span style={{ display: "block", fontSize: 12, color: "#A79BA1", marginTop: 2 }}>현장에서 현금으로 받았다면 체크를 끄고, 아래 현금 수령에 기록해 주세요.</span></span>
            </label>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#6E646A", display: "flex", alignItems: "center", gap: 8 }}>추가 인원
              <input inputMode="numeric" value={actual} onChange={(e) => setActual(e.target.value.replace(/[^0-9]/g, ""))} placeholder={hasBalance ? "없으면 비워 두세요" : "예: 30"} style={input} />명
            </label>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: total > 0 ? "#B0567E" : "#A79BA1" }}>
              {balance > 0
                ? `잔금 ${won(balance)}${diff > 0 ? ` + 차액 ${won(diff)} = ${won(total)}` : ""}`
                : diff > 0 ? `청구 차액 ${won(diff)}` : ""}
            </span>
            <button disabled={busy || total <= 0} onClick={() => send()}
              style={{ marginLeft: "auto", height: 40, padding: "0 16px", border: 0, borderRadius: 12, background: "#B0567E", color: "#FFFFFF", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: busy || total <= 0 ? 0.5 : 1 }}>
              {balance > 0 ? (diff > 0 ? "잔금 + 차액 결제 링크 보내기" : "잔금 결제 링크 보내기") : "차액 청구 링크 보내기"}
            </button>
            <button disabled={busy || total <= 0} onClick={() => send(true)}
              style={{ height: 40, padding: "0 14px", borderRadius: 12, border: "1px solid #E4DCE1", background: "#FFFFFF", color: "#413A3E", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: busy || total <= 0 ? 0.5 : 1 }}>
              문자로 보내기
            </button>
          </div>
          {data.claims.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
              {data.claims.map((c) => (
                <div key={c.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px", padding: "10px 12px", borderRadius: 12, border: "1px solid #EFEBED", fontSize: 13 }}>
                  <b>{won(c.amount)}</b>{c.extraGuests > 0 && <span style={{ color: "#6E646A" }}>추가 하객 {c.extraGuests}명</span>}<span style={{ color: "#8C8188" }}>{c.expired ? "만료" : STATUS[c.status] ?? c.status} · 발송 {c.createdLabel}{c.paidLabel ? ` · 결제 ${c.paidLabel}` : ""}</span>
                  {c.status === "sent" && !c.expired && c.url && (
                    <button type="button" onClick={() => copy(c.url)} style={{ marginLeft: "auto", height: 28, padding: "0 12px", borderRadius: 10, border: "1px solid #E5DDE1", background: "#FFFFFF", color: "#8A3F61", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>링크 복사</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
