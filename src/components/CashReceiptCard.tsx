"use client";

import { useState, useTransition } from "react";
import { receiveCashPayment, retryCashReceipt, cancelCashReceiptAction } from "@/lib/actions";
import type { CashReceiptRow } from "@/lib/cashReceipt";
import { won } from "@/lib/pricing";
import { useToast } from "./ToastContext";

const ST: Record<CashReceiptRow["status"], { text: string; bg: string; color: string }> = {
  issued: { text: "발급 완료", bg: "#E9F5EE", color: "#2F7A4C" },
  failed: { text: "발급 실패", bg: "#FDECEC", color: "#B03A3A" },
  cancelled: { text: "발급 취소", bg: "#F1EEEF", color: "#8C8188" },
  none: { text: "영수증 없음", bg: "#F1EEEF", color: "#8C8188" },
};
const KIND_LABEL: Record<string, string> = { PERSONAL: "소득공제", CORPORATE: "지출증빙" };

const input: React.CSSProperties = { border: 0, background: "#FFFFFF", borderRadius: 10, height: 40, padding: "0 12px", fontSize: 13.5, color: "#1E1A1C", boxSizing: "border-box", width: "100%" };
const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "#6E646A" };
const outline: React.CSSProperties = { height: 32, padding: "0 12px", borderRadius: 10, border: "1px solid #E5DDE1", background: "#FFFFFF", color: "#6E646A", fontSize: 12, fontWeight: 700, cursor: "pointer" };

/** 예약 상세의 "현금 수령·현금영수증": 현장(현금) 잔액을 현금으로 받았을 때 결제한 금액에 더하고 현금영수증을 발급한다. */
export default function CashReceiptCard({ reservationId, customer, phone, balance, receipts, cancelled, card }: {
  reservationId: string; customer: string; phone: string; balance: number; receipts: CashReceiptRow[]; cancelled: boolean; card: React.CSSProperties;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [issue, setIssue] = useState(true);
  const [kind, setKind] = useState<"PERSONAL" | "CORPORATE">("PERSONAL");
  const [number, setNumber] = useState("");

  function openForm() {
    setAmount(String(balance || ""));
    setNumber(phone.replace(/[^0-9]/g, ""));
    setKind("PERSONAL");
    setIssue(true);
    setOpen(true);
  }

  function pickKind(k: "PERSONAL" | "CORPORATE") {
    setKind(k);
    setNumber(k === "PERSONAL" ? phone.replace(/[^0-9]/g, "") : "");
  }

  const amt = Number(amount.replace(/[^0-9]/g, "")) || 0;

  function submit() {
    const digits = number.replace(/[^0-9]/g, "");
    const who = kind === "CORPORATE" ? `사업자번호 ${digits}` : `휴대폰 ${digits}`;
    if (!window.confirm(`${customer} 님에게 현금 ${won(amt)}을 받은 것으로 기록합니다.${issue ? `\n${KIND_LABEL[kind]} 현금영수증(${who})을 국세청에 발급합니다. 발급 후에는 취소만 가능합니다.` : "\n현금영수증은 발급하지 않습니다."}\n진행할까요?`)) return;
    start(async () => {
      const res = await receiveCashPayment(reservationId, { amount: amt, issue, kind, identityType: kind === "CORPORATE" ? "BUSINESS" : "PHONE", identityNumber: digits });
      toast(res.message);
      if (res.ok || /이미 기록/.test(res.message)) setOpen(false);
    });
  }

  function retry(id: string) {
    start(async () => toast((await retryCashReceipt(id)).message));
  }
  function cancelOne(id: string) {
    if (!window.confirm("발급한 현금영수증을 취소할까요? 결제한 금액은 그대로 두니, 현금을 돌려줬다면 결제한 금액은 따로 고쳐 주세요.")) return;
    start(async () => toast((await cancelCashReceiptAction(id)).message));
  }

  if (cancelled && receipts.length === 0) return null;

  return (
    <section style={card}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: open || receipts.length ? 16 : 0 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>현금 수령 · 현금영수증</h2>
          <p style={{ margin: 0, fontSize: 12.5, color: "#A79BA1" }}>현장(현금) 잔액을 현금으로 받았을 때 기록하고, 현금영수증을 발급합니다. 받은 금액은 결제한 금액에 더해집니다.</p>
        </div>
        {!cancelled && !open && (
          <button type="button" disabled={pending} onClick={openForm} style={{ ...outline, height: 38, flex: "0 0 auto" }}>현금 받고 영수증 발급</button>
        )}
      </div>

      {open && (
        <div style={{ background: "#F8F6F7", borderRadius: 14, padding: 14, marginBottom: receipts.length ? 16 : 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <label style={{ ...label, flex: "1 1 160px" }}>받은 현금 (원)
              <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} style={{ ...input, marginTop: 6 }} />
            </label>
            <label style={{ ...label, flex: "1 1 160px", display: "flex", alignItems: "center", gap: 8, marginTop: 22 }}>
              <input type="checkbox" checked={issue} onChange={(e) => setIssue(e.target.checked)} /> 현금영수증 발급
            </label>
          </div>
          {issue && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
              <label style={{ ...label, flex: "1 1 140px" }}>발급 대상
                <select value={kind} onChange={(e) => pickKind(e.target.value as "PERSONAL" | "CORPORATE")} style={{ ...input, marginTop: 6 }}>
                  <option value="PERSONAL">소득공제 (개인 휴대폰)</option>
                  <option value="CORPORATE">지출증빙 (사업자)</option>
                </select>
              </label>
              <label style={{ ...label, flex: "2 1 180px" }}>{kind === "CORPORATE" ? "사업자등록번호 (숫자 10자리)" : "휴대폰 번호"}
                <input inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.replace(/[^0-9]/g, ""))} style={{ ...input, marginTop: 6 }} />
              </label>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button type="button" disabled={pending} onClick={() => setOpen(false)} style={{ height: 40, padding: "0 16px", border: 0, borderRadius: 12, background: "#FFFFFF", color: "#6E646A", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>닫기</button>
            <button type="button" disabled={pending || amt <= 0} onClick={submit} style={{ height: 40, padding: "0 18px", border: 0, borderRadius: 12, background: "#B0567E", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: pending ? 0.7 : 1 }}>
              {pending ? "처리 중…" : issue ? `${won(amt)} 받고 영수증 발급` : `${won(amt)} 현금만 기록`}
            </button>
          </div>
        </div>
      )}

      {receipts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {receipts.map((r) => {
            const st = ST[r.status];
            return (
              <div key={r.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px", padding: "12px 14px", borderRadius: 12, border: "1px solid #EFEBED", fontSize: 13 }}>
                <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 800, background: st.bg, color: st.color }}>{st.text}</span>
                <span style={{ fontWeight: 700, color: "#413A3E" }}>{won(r.amount)}</span>
                <span style={{ flex: "1 1 200px", minWidth: 0, color: "#8C8188", fontSize: 12.5 }}>
                  {r.createdLabel}{r.kind ? ` · ${KIND_LABEL[r.kind] ?? r.kind} ${r.identityMasked}` : ""}{r.issueNumber ? ` · 승인번호 ${r.issueNumber}` : ""}{r.status === "failed" && r.detail ? ` · ${r.detail}` : ""}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  {r.status === "issued" && r.url && <a href={r.url} target="_blank" rel="noreferrer" style={{ ...outline, display: "inline-flex", alignItems: "center" }}>영수증 보기</a>}
                  {r.status === "failed" && <button type="button" disabled={pending} onClick={() => retry(r.id)} style={outline}>다시 발급</button>}
                  {r.status === "issued" && <button type="button" disabled={pending} onClick={() => cancelOne(r.id)} style={outline}>발급 취소</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
