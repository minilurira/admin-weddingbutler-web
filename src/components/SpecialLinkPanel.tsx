"use client";

import { useEffect, useState } from "react";
import { cancelSpecialOffer, createSpecialOffer, listSpecialOffers, type SpecialOfferView } from "@/lib/specialActions";
import { won } from "@/lib/pricing";
import { useToast } from "./ToastContext";

const STATE_LABEL: Record<SpecialOfferView["state"], { text: string; bg: string; color: string }> = {
  open: { text: "대기", bg: "#FBEFD9", color: "#8A5A00" },
  held: { text: "결제 진행 중", bg: "#F7EDF2", color: "#A8416C" },
  used: { text: "결제 완료", bg: "#E3F1E8", color: "#2B6A45" },
  cancelled: { text: "취소", bg: "#EEECED", color: "#8A8487" },
  expired: { text: "만료", bg: "#EEECED", color: "#8A8487" },
};

const inputStyle: React.CSSProperties = { border: 0, background: "#F6F3F5", borderRadius: 12, padding: "12px 14px", fontSize: 13.5, color: "#1E1A1C", width: "100%", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: "#6E646A", display: "flex", flexDirection: "column", gap: 6 };

export default function SpecialLinkPanel() {
  const showToast = useToast();
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [days, setDays] = useState("7");
  const [saving, setSaving] = useState(false);
  const [offers, setOffers] = useState<SpecialOfferView[]>([]);
  const [created, setCreated] = useState<SpecialOfferView | null>(null);

  const reload = () => listSpecialOffers().then(setOffers).catch(() => {});
  useEffect(() => { void reload(); }, []);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      showToast("링크를 복사했습니다.");
    } catch {
      window.prompt("아래 링크를 복사하세요.", url);
    }
  }

  async function make() {
    const n = Number(amount);
    if (!n) return showToast("스페셜 금액을 입력해 주세요.");
    setSaving(true);
    try {
      const o = await createSpecialOffer({ amount: n, label, days: Number(days) });
      setCreated(o);
      setAmount("");
      setLabel("");
      void reload();
      void copy(o.url);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "링크를 만들지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    if (!window.confirm("이 링크를 취소할까요? 고객이 더 이상 열 수 없습니다.")) return;
    showToast((await cancelSpecialOffer(id)) ? "링크를 취소했습니다." : "취소할 수 없는 링크입니다.");
    void reload();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 12.5, color: "#8C8188", lineHeight: 1.6 }}>
        금액만 정해 링크를 만들어 고객에게 보내세요. 고객이 링크에서 예식 날짜·시간·예식장을 고르고 정해 둔 금액을 카드로 전액 결제하면, 예약이 자동으로 들어옵니다.
      </div>
      <label style={labelStyle}>
        스페셜 금액 (원)
        <input style={inputStyle} inputMode="numeric" value={amount ? Number(amount).toLocaleString("ko-KR") : ""} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="예: 1,200,000" />
      </label>
      <div style={{ display: "flex", gap: 10 }}>
        <label style={{ ...labelStyle, flex: 2 }}>
          메모 (선택)
          <input style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 김OO 님 맞춤 견적" maxLength={60} />
        </label>
        <label style={{ ...labelStyle, flex: 1 }}>
          유효기간
          <select style={inputStyle} value={days} onChange={(e) => setDays(e.target.value)}>
            {[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d}일</option>)}
          </select>
        </label>
      </div>
      <button type="button" disabled={saving} onClick={make} style={{ height: 48, border: 0, borderRadius: 12, background: "#B0567E", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
        {saving ? "만드는 중…" : "링크 만들기"}
      </button>

      {created && (
        <div style={{ padding: 14, borderRadius: 12, background: "#F9EFF4", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#7E3855" }}>{won(created.amount)} 링크를 만들고 복사했습니다</div>
          <div style={{ fontSize: 12.5, color: "#413A3E", wordBreak: "break-all", userSelect: "all" }}>{created.url}</div>
          <button type="button" onClick={() => copy(created.url)} style={{ alignSelf: "flex-start", height: 34, padding: "0 14px", border: "1px solid #D9A3BC", borderRadius: 10, background: "#fff", color: "#8A3F61", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>다시 복사</button>
        </div>
      )}

      <div style={{ borderTop: "1px solid #ECE7E9", paddingTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>최근 스페셜 링크</div>
        {offers.length === 0 && <div style={{ fontSize: 12.5, color: "#8C8188" }}>아직 만든 링크가 없습니다.</div>}
        {offers.map((o) => {
          const st = STATE_LABEL[o.state];
          const live = o.state === "open" || o.state === "held";
          return (
            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderBottom: "1px solid #F4F1F3" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{won(o.amount)} {o.label && <span style={{ fontWeight: 500, color: "#6E646A" }}>· {o.label}</span>}</div>
                <div style={{ fontSize: 11.5, color: "#8C8188" }}>
                  {o.state === "used" && o.bookingNo ? `예약번호 ${o.bookingNo}` : `~ ${new Date(o.expiresAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}까지`}
                </div>
              </div>
              <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: st.bg, color: st.color, whiteSpace: "nowrap" }}>{st.text}</span>
              {live && <button type="button" onClick={() => copy(o.url)} style={{ border: 0, background: "transparent", color: "#8A3F61", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>복사</button>}
              {live && <button type="button" onClick={() => cancel(o.id)} style={{ border: 0, background: "transparent", color: "#8C8188", fontSize: 12.5, cursor: "pointer" }}>취소</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
