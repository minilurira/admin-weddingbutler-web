"use client";

import { useState, useTransition } from "react";
import { sendAlimtalkManually } from "@/lib/actions";
import { useToast } from "./ToastContext";

const FORMS = [
  { key: "confirm", label: "예약 확정 안내" },
  { key: "remind7d", label: "예식 7일 전 안내" },
  { key: "remindDay", label: "예식 당일 안내" },
] as const;

/** 예약 상세의 "알림톡 수동 발송": 양식을 골라 이 예약의 고객에게 지금 보낸다. 결과는 아래 발송 내역에 남는다. */
export default function ManualAlimtalk({ reservationId, customer, card }: { reservationId: string; customer: string; card: React.CSSProperties }) {
  const toast = useToast();
  const [key, setKey] = useState<(typeof FORMS)[number]["key"]>("confirm");
  const [pending, start] = useTransition();
  const label = FORMS.find((f) => f.key === key)!.label;

  function send() {
    if (!window.confirm(`${customer} 님에게 "${label}" 알림톡을 지금 보낼까요? 이미 보낸 적이 있어도 다시 보냅니다.`)) return;
    start(async () => toast((await sendAlimtalkManually(reservationId, key)).message));
  }

  return (
    <section style={card}>
      <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>알림톡 수동 발송</h2>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#A79BA1" }}>양식을 골라 고객에게 바로 보냅니다. 보낸 결과는 아래 발송 내역에 남습니다.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <select value={key} onChange={(e) => setKey(e.target.value as typeof key)} disabled={pending} aria-label="알림톡 양식"
          style={{ border: 0, background: "#F6F3F5", borderRadius: 12, padding: "0 14px", height: 40, fontSize: 13.5, color: "#1E1A1C", flex: "1 1 200px", minWidth: 0 }}>
          {FORMS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <button type="button" disabled={pending} onClick={send}
          style={{ height: 40, padding: "0 18px", border: 0, borderRadius: 12, background: "#B0567E", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: pending ? 0.7 : 1 }}>{pending ? "보내는 중…" : "보내기"}</button>
      </div>
    </section>
  );
}
