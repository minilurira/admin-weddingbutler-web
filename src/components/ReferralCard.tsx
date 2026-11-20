"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setReservationReferral } from "@/lib/referralActions";
import { won } from "@/lib/pricing";
import { useToast } from "./ToastContext";

export interface DetailReferral {
  code: string;
  name: string;
  amount: number;
  status: "pending" | "ready" | "paid" | "void";
  voidReason: string;
}

const ST: Record<DetailReferral["status"], { text: string; bg: string; color: string }> = {
  pending: { text: "예식 전", bg: "#FBEFD9", color: "#8A5A00" },
  ready: { text: "정산 가능", bg: "#F9EFF4", color: "#A8416C" },
  paid: { text: "정산 완료", bg: "#E3F1E8", color: "#2B6A45" },
  void: { text: "제외", bg: "#EEECED", color: "#8A8487" },
};

const btn: React.CSSProperties = { height: 36, padding: "0 14px", borderRadius: 10, border: "1px solid #E5DDE1", background: "#FFFFFF", color: "#6E646A", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };

/** 예약 상세의 "영업대행 추천": 이 예약에 연결된 추천 코드와 수수료. 전화·카톡으로 받은 예약에도 코드를 붙일 수 있다. */
export default function ReferralCard({ reservationId, referral, card }: { reservationId: string; referral: DetailReferral | null; card: React.CSSProperties }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState(false);
  const [code, setCode] = useState(referral?.code ?? "");

  function save(value: string) {
    start(async () => {
      const r = await setReservationReferral(reservationId, value);
      toast(r.message);
      if (r.ok) {
        setEdit(false);
        router.refresh();
      }
    });
  }

  const st = referral ? ST[referral.status] : null;
  const locked = referral?.status === "paid";
  return (
    <section style={card}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>영업대행 추천</h2>
          {referral && st ? (
            <p style={{ margin: 0, fontSize: 13, color: "#413A3E", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <b>{referral.name}</b> <span style={{ color: "#8C8188" }}>{referral.code}</span>
              <span>수수료 {won(referral.amount)}</span>
              <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 800, background: st.bg, color: st.color }}>{st.text}</span>
              {referral.voidReason && <span style={{ color: "#8C8188", fontSize: 12 }}>{referral.voidReason}</span>}
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 12.5, color: "#A79BA1" }}>추천 코드 없이 들어온 예약입니다.</p>
          )}
        </div>
        {!edit && !locked && (
          <button type="button" style={btn} disabled={pending} onClick={() => { setCode(referral?.code ?? ""); setEdit(true); }}>{referral ? "코드 변경" : "추천 코드 연결"}</button>
        )}
      </div>
      {edit && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="예: WB7K3QD" aria-label="추천 코드"
            style={{ flex: "1 1 160px", border: 0, background: "#F8F6F7", borderRadius: 10, height: 36, padding: "0 12px", fontSize: 13.5 }} />
          <button type="button" style={{ ...btn, background: "#B0567E", color: "#fff", border: 0 }} disabled={pending || !code.trim()} onClick={() => save(code)}>저장</button>
          {referral && <button type="button" style={btn} disabled={pending} onClick={() => { if (window.confirm("이 예약의 추천 코드를 해제할까요? 수수료도 함께 지워집니다.")) save(""); }}>연결 해제</button>}
          <button type="button" style={btn} disabled={pending} onClick={() => setEdit(false)}>닫기</button>
        </div>
      )}
      {locked && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#A79BA1" }}>정산이 끝난 수수료라 바꿀 수 없습니다. 바꾸려면 영업대행 화면에서 정산을 먼저 취소하세요.</p>}
    </section>
  );
}
