"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelInvitationOrder } from "@/lib/invitationOrderActions";
import { TEMPLATE_NAME, type InvitationOrder } from "@/lib/invitationOrders";
import { formatStamp } from "@/lib/format";
import { won } from "@/lib/pricing";
import { useToast } from "./ToastContext";

const STATUS: Record<string, { label: string; bg: string; color: string; order: number }> = {
  paid: { label: "결제 완료", bg: "#E9F5EE", color: "#2F7A4C", order: 0 },
  cancelled: { label: "취소(환불)", bg: "#EEECED", color: "#6E646A", order: 1 },
  pending: { label: "결제 시도(미완료)", bg: "#FBEFD9", color: "#8A5A00", order: 2 },
  failed: { label: "실패", bg: "#FBE9E9", color: "#A8416C", order: 3 },
};

const shiftMonth = (month: string, k: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + k, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export default function InvitationOrders({ orders, month }: { orders: InvitationOrder[]; month: string }) {
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState<"all" | "paid" | "cancelled" | "pending">("all");
  const [target, setTarget] = useState<InvitationOrder | null>(null);
  const [reason, setReason] = useState("");
  const [after, setAfter] = useState<"free" | "hide">("free");
  const [busy, setBusy] = useState(false);

  const paid = orders.filter((o) => o.status === "paid");
  const cancelled = orders.filter((o) => o.status === "cancelled");
  const pending = orders.filter((o) => o.status === "pending" || o.status === "failed");
  const paidSum = paid.reduce((a, o) => a + o.amount, 0);
  const cancelSum = cancelled.reduce((a, o) => a + (o.cancelledAmount ?? o.amount), 0);
  const shown = orders
    .filter((o) => filter === "all" || (filter === "pending" ? o.status === "pending" || o.status === "failed" : o.status === filter))
    .sort((a, b) => (STATUS[a.status]?.order ?? 9) - (STATUS[b.status]?.order ?? 9) || b.createdAt.localeCompare(a.createdAt));

  const chip = (active: boolean): React.CSSProperties => ({ height: 36, padding: "0 14px", border: 0, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", background: active ? "#F9EFF4" : "#F6F3F5", color: active ? "#B0567E" : "#6E646A" });
  const tile: React.CSSProperties = { background: "#F8F6F7", borderRadius: 16, padding: "16px 18px", flex: "1 1 170px" };

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast("복사했습니다."); } catch { window.prompt("복사하세요.", text); }
  }

  function openCancel(o: InvitationOrder) {
    setTarget(o);
    setReason("");
    setAfter("free");
  }

  function submitCancel() {
    if (!target) return;
    if (!reason.trim()) return toast("취소 사유를 입력해 주세요.");
    if (!window.confirm(`${target.groom || ""} ${target.bride || ""} 님의 ${won(target.amount)} 결제를 전액 취소(환불)합니다. 카드 승인 취소가 바로 진행되고 되돌릴 수 없습니다. 진행할까요?`)) return;
    setBusy(true);
    startTransition(async () => {
      try {
        const res = await cancelInvitationOrder(target.paymentId, reason, after);
        toast(res.message);
        if (res.ok) {
          setTarget(null);
          router.refresh();
        }
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 27, fontWeight: 800, letterSpacing: "-0.7px" }}>청첩장 결제</h1>
        <div role="group" aria-label="월 선택" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <Link href={`/invitation-orders?month=${shiftMonth(month, -1)}`} aria-label="이전 달" style={{ ...chip(false), display: "inline-flex", alignItems: "center" }}>‹</Link>
          <b style={{ fontSize: 15, minWidth: 100, textAlign: "center" }}>{month.replace("-", "년 ")}월</b>
          <Link href={`/invitation-orders?month=${shiftMonth(month, 1)}`} aria-label="다음 달" style={{ ...chip(false), display: "inline-flex", alignItems: "center" }}>›</Link>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 13.5, color: "#6E646A", lineHeight: 1.7 }}>
        모바일 청첩장 프리미엄(발행할 때 한 번 결제) 결제내역입니다. 취소하면 카드 결제가 전액 환불되고, 그 청첩장은 프리미엄 기능을 쓸 수 없게 됩니다.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={tile}><div style={{ fontSize: 12.5, color: "#6E646A" }}>결제 완료</div><div style={{ fontSize: 24, fontWeight: 800 }}>{paid.length}건</div><div style={{ fontSize: 13, color: "#2F7A4C", fontWeight: 700 }}>{won(paidSum)}</div></div>
        <div style={tile}><div style={{ fontSize: 12.5, color: "#6E646A" }}>취소(환불)</div><div style={{ fontSize: 24, fontWeight: 800 }}>{cancelled.length}건</div><div style={{ fontSize: 13, color: "#6E646A", fontWeight: 700 }}>{won(cancelSum)}</div></div>
        <div style={tile}><div style={{ fontSize: 12.5, color: "#6E646A" }}>이번 달 순매출</div><div style={{ fontSize: 24, fontWeight: 800 }}>{won(paidSum)}</div><div style={{ fontSize: 12, color: "#8C8188" }}>결제 완료 합계 (취소는 이미 제외)</div></div>
        <div style={tile}><div style={{ fontSize: 12.5, color: "#6E646A" }}>결제 시도(미완료)</div><div style={{ fontSize: 24, fontWeight: 800 }}>{pending.length}건</div><div style={{ fontSize: 12, color: "#8C8188" }}>결제창을 열었지만 끝내지 않음</div></div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={chip(filter === "all")} onClick={() => setFilter("all")}>전체 {orders.length}</button>
        <button type="button" style={chip(filter === "paid")} onClick={() => setFilter("paid")}>결제 완료 {paid.length}</button>
        <button type="button" style={chip(filter === "cancelled")} onClick={() => setFilter("cancelled")}>취소 {cancelled.length}</button>
        <button type="button" style={chip(filter === "pending")} onClick={() => setFilter("pending")}>미완료 {pending.length}</button>
      </div>

      <div style={{ overflowX: "auto", background: "#F8F6F7", borderRadius: 18, padding: "8px 16px 12px" }}>
        <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#8C8188", fontSize: 12.5 }}>
              {["결제 시각", "만든 사람", "템플릿 · 금액", "상태", "청첩장", ""].map((h, i) => <th key={i} style={{ padding: "10px 10px", fontWeight: 600, borderBottom: "1px solid #ECE7E9", whiteSpace: "nowrap" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6} style={{ padding: "22px 10px", color: "#8C8188" }}>이 달의 결제내역이 없습니다.</td></tr>}
            {shown.map((o) => {
              const st = STATUS[o.status] ?? { label: o.status, bg: "#EEECED", color: "#6E646A", order: 9 };
              return (
                <tr key={o.paymentId} style={{ borderBottom: "1px solid #ECE7E9", verticalAlign: "top" }}>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap" }}>
                    {formatStamp(new Date(o.paidAt ?? o.createdAt))}<br />
                    <small style={{ color: "#8C8188" }}>{o.paidAt ? "결제" : "시도"}{o.cancelledAt ? ` · 취소 ${formatStamp(new Date(o.cancelledAt))}` : ""}</small>
                  </td>
                  <td style={{ padding: "12px 10px" }}>
                    <b>{[o.groom, o.bride].filter(Boolean).join(" · ") || "이름 없음"}</b><br />
                    {o.phone ? <button type="button" onClick={() => copy(o.phone)} title="누르면 복사" style={{ border: 0, background: "transparent", padding: 0, color: "#B0567E", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{o.phone}</button> : <small style={{ color: "#8C8188" }}>연락처 없음</small>}
                  </td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap" }}>
                    {TEMPLATE_NAME[o.template] ?? o.template}<br /><b>{won(o.amount)}</b>
                  </td>
                  <td style={{ padding: "12px 10px", minWidth: 150 }}>
                    <span style={{ display: "inline-block", padding: "3px 11px", borderRadius: 99, fontSize: 12, fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span>
                    {o.status === "cancelled" && o.cancelReason && <div style={{ marginTop: 6, fontSize: 12.5, color: "#6E646A", lineHeight: 1.5 }}>사유: {o.cancelReason}</div>}
                    <div style={{ marginTop: 4 }}><button type="button" onClick={() => copy(o.paymentId)} title="결제번호 복사" style={{ border: 0, background: "transparent", padding: 0, color: "#8C8188", fontSize: 11, cursor: "pointer" }}>{o.paymentId.slice(0, 22)}…</button></div>
                  </td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap", fontSize: 13 }}>
                    {o.invitationId === null
                      ? <small style={{ color: "#8C8188" }}>삭제됨</small>
                      : <>{o.invitationStatus === "published" ? "공개 중" : o.invitationStatus === "hidden" ? "비공개" : "작성 중"}{o.invitationTemplate && o.invitationTemplate !== o.template ? <small style={{ color: "#8C8188" }}> · {TEMPLATE_NAME[o.invitationTemplate] ?? o.invitationTemplate}</small> : null}<br />{o.url && o.invitationStatus === "published" && <a href={o.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 700 }}>하객 화면 ↗</a>}</>}
                  </td>
                  <td style={{ padding: "12px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {o.status === "paid" && <button type="button" onClick={() => openCancel(o)} style={{ height: 36, padding: "0 14px", border: "1px solid #E5C9D6", borderRadius: 10, background: "#FFFFFF", color: "#A8416C", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>결제 취소</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {target && (
        <div role="dialog" aria-modal="true" aria-label="결제 취소" style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(30,20,26,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 480, background: "#FFFFFF", borderRadius: 20, padding: 26, boxSizing: "border-box" }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>결제 취소(환불)</h2>
            <p style={{ margin: "8px 0 14px", fontSize: 13.5, lineHeight: 1.7, color: "#6E646A" }}>
              <b style={{ color: "#33232A" }}>{[target.groom, target.bride].filter(Boolean).join(" · ") || "이름 없음"}</b> 님의 <b style={{ color: "#33232A" }}>{won(target.amount)}</b> 결제를 전액 취소합니다. 카드 승인 취소가 바로 진행되고 되돌릴 수 없습니다.
            </p>
            <label htmlFor="cancelReason" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>취소 사유 (필수)</label>
            <input id="cancelReason" value={reason} maxLength={100} onChange={(e) => setReason(e.target.value)} placeholder="예: 고객 요청, 중복 결제" style={{ width: "100%", boxSizing: "border-box", height: 44, border: "1px solid #E1D9DD", borderRadius: 12, padding: "0 14px", fontSize: 14, fontFamily: "inherit" }} />
            <fieldset style={{ margin: "16px 0 0", padding: 0, border: 0 }}>
              <legend style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>이 청첩장은 어떻게 할까요?</legend>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", border: `1px solid ${after === "free" ? "#B0567E" : "#E1D9DD"}`, borderRadius: 12, marginBottom: 8, cursor: "pointer", fontSize: 13.5, lineHeight: 1.6 }}>
                <input type="radio" name="after" checked={after === "free"} onChange={() => setAfter("free")} style={{ marginTop: 4 }} />
                <span><b>무료 템플릿으로 바꾸고 공개는 그대로</b><br /><small style={{ color: "#6E646A" }}>이미 주소를 받은 하객은 계속 볼 수 있어요. 갤러리 사진은 12장까지만 남습니다.</small></span>
              </label>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", border: `1px solid ${after === "hide" ? "#B0567E" : "#E1D9DD"}`, borderRadius: 12, cursor: "pointer", fontSize: 13.5, lineHeight: 1.6 }}>
                <input type="radio" name="after" checked={after === "hide"} onChange={() => setAfter("hide")} style={{ marginTop: 4 }} />
                <span><b>비공개로 바꾸기</b><br /><small style={{ color: "#6E646A" }}>주소로 들어와도 청첩장이 보이지 않아요.</small></span>
              </label>
            </fieldset>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button type="button" disabled={busy} onClick={() => setTarget(null)} style={{ height: 44, padding: "0 18px", border: 0, borderRadius: 12, background: "#F1EDEF", color: "#473A3F", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>닫기</button>
              <button type="button" disabled={busy || !reason.trim()} onClick={submitCancel} style={{ height: 44, padding: "0 20px", border: 0, borderRadius: 12, background: "#A8416C", color: "#FFFFFF", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: busy || !reason.trim() ? 0.55 : 1 }}>{busy ? "취소 처리 중…" : "전액 취소(환불)"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
