"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calcConfirm, EXTRA_BUTLER_FEE, onsiteAmount, PAYMENT_TYPES, paymentTypeName, requestedTotal, resolvePaymentType, won, type PaymentType } from "@/lib/pricing";
import { BADGE } from "@/lib/badge";
import { formatWishDateLabel, toNum } from "@/lib/format";
import { refundQuote } from "@/lib/refundPolicy";
import { useIsMobile } from "@/lib/useIsMobile";
import { useToast } from "./ToastContext";
import { confirmReservation, holdReservation, addNote, resendAlimtalk, saveConfirmFields, cancelReservation, reopenReservation } from "@/lib/actions";

export interface DetailNote {
  id: string;
  when: string;
  text: string;
}

export interface DetailReservation {
  id: string;
  customer: string;
  couple: string;
  side: string;
  phone: string;
  createdAtLabel: string;
  wishDateLabel: string;
  venueLabel: string;
  guestsLabel: string;
  memo: string;
  customerMemo: string;
  status: string;
  requestedPlan: string;
  paidAmount: number;
  paymentType: string;
  requestedTotal: number;
  requestedExtraButlers: number;
  alimtalkLabel: string;
  cancel: { reason: string; atLabel: string; refundAmount: number } | null;
  recordStatus: "none" | "draft" | "published" | "revoked";
  notes: DetailNote[];
  confirm: {
    plan: string;
    date: string;
    time: string;
    venue: string;
    butlers: number;
    extraGuests: number;
    discount: number;
    hours: string;
    note: string;
  };
}

const RECORD_STATUS_TEXT: Record<DetailReservation["recordStatus"], string> = {
  none: "예식이 끝나면 명단을 올려 고객용 링크를 만드세요.",
  draft: "작성 중 · 아직 고객에게 게시하지 않았어요.",
  published: "게시됨 · 고객이 링크로 볼 수 있어요.",
  revoked: "회수됨 · 고객 링크가 막혀 있어요.",
};

export default function ReservationDetail({
  reservation, backHref, className,
}: {
  reservation: DetailReservation;
  backHref: string;
  className?: string;
}) {
  const mobile = useIsMobile();
  const router = useRouter();
  const showToast = useToast();
  const [isPending, startTransition] = useTransition();
  const [noteDraft, setNoteDraft] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reasonType, setReasonType] = useState<"고객요청" | "직접입력">("고객요청");
  const [customReason, setCustomReason] = useState("");
  const [noPaymentMessage, setNoPaymentMessage] = useState<string | null>(null);
  const [refundDraft, setRefundDraft] = useState("");
  const [editing, setEditing] = useState(false);

  const [fields, setFields] = useState({
    date: reservation.confirm.date,
    time: reservation.confirm.time,
    venue: reservation.confirm.venue,
    butlers: String(reservation.confirm.butlers),
    extraGuests: String(reservation.confirm.extraGuests),
    discount: String(reservation.confirm.discount),
    hours: reservation.confirm.hours,
    note: reservation.confirm.note,
    paidAmount: String(reservation.paidAmount),
    paymentType:
      resolvePaymentType(
        reservation.paymentType,
        reservation.paidAmount,
        calcConfirm({ plan: reservation.confirm.plan, butlers: reservation.confirm.butlers, extraGuests: reservation.confirm.extraGuests, discount: reservation.confirm.discount }).total
      ) ?? "",
  });

  const parsedFields = useMemo(
    () => ({
      date: fields.date,
      time: fields.time,
      venue: fields.venue,
      butlers: toNum(fields.butlers),
      extraGuests: toNum(fields.extraGuests),
      discount: toNum(fields.discount),
      hours: fields.hours,
      note: fields.note,
      paidAmount: toNum(fields.paidAmount),
      paymentType: fields.paymentType,
    }),
    [fields]
  );

  const money = useMemo(() => calcConfirm({ plan: reservation.confirm.plan, butlers: parsedFields.butlers, extraGuests: parsedFields.extraGuests, discount: parsedFields.discount }), [reservation.confirm.plan, parsedFields]);
  const req = useMemo(() => {
    const est = requestedTotal(reservation.requestedPlan, reservation.guestsLabel);
    // 홈페이지 예약은 홈페이지가 보낸 금액을 그대로 보여준다(초과 식권은 당일 정산이라 총액에 없음).
    if (reservation.requestedTotal > 0) {
      const butlerFee = reservation.requestedExtraButlers * EXTRA_BUTLER_FEE;
      return { ...est, fromHomepage: true, base: reservation.requestedTotal - butlerFee, butlerFee, total: reservation.requestedTotal };
    }
    return { ...est, fromHomepage: false, base: est.meta.base, butlerFee: 0 };
  }, [reservation.requestedPlan, reservation.guestsLabel, reservation.requestedTotal, reservation.requestedExtraButlers]);

  const badge = BADGE[reservation.status] ?? BADGE["신규요청"];
  const isConfirmed = reservation.status === "확정";
  const isCancelled = reservation.status === "취소";
  // 확정된 예약은 잠그고, 고치려면 재협의로 되돌린다
  const locked = isConfirmed;
  const cancelReason = reasonType === "고객요청" ? "고객요청" : customReason.trim();
  const quote = refundQuote(reservation.confirm.date, reservation.paidAmount);
  const refundAmount = toNum(refundDraft);

  function field(key: keyof typeof fields) {
    return {
      value: fields[key],
      readOnly: locked,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFields((f) => ({ ...f, [key]: e.target.value })),
      onBlur: () => { if (!locked) startTransition(() => { saveConfirmFields(reservation.id, parsedFields); }); },
    };
  }

  function closeDetail() {
    router.push(backHref);
  }

  function onConfirmClick() {
    startTransition(async () => {
      const res = await confirmReservation(reservation.id, parsedFields);
      showToast(res.message);
    });
  }

  function onHoldClick() {
    startTransition(async () => {
      const res = await holdReservation(reservation.id);
      showToast(res.message);
    });
  }

  function onReopenClick() {
    if (!window.confirm("재협의로 바꾸면 협의중 상태가 되고 캘린더에서 빠집니다. 내용을 고친 뒤 다시 확정해 주세요.")) return;
    startTransition(async () => {
      const res = await reopenReservation(reservation.id);
      showToast(res.message);
    });
  }

  function onAddNote() {
    if (!noteDraft.trim()) { showToast("협의 내용을 입력해 주세요."); return; }
    startTransition(async () => {
      const res = await addNote(reservation.id, noteDraft);
      if (res.ok) setNoteDraft("");
      showToast(res.message);
    });
  }

  function openCancel() {
    setReasonType("고객요청");
    setCustomReason("");
    setNoPaymentMessage(null);
    setRefundDraft(String(refundQuote(reservation.confirm.date, reservation.paidAmount).amount));
    setCancelOpen(true);
  }

  function onCancelSubmit(skipPayment: boolean) {
    if (!cancelReason) { showToast("취소 사유를 입력해 주세요."); return; }
    if (refundAmount > reservation.paidAmount) { showToast(`환불 금액은 결제금액(${won(reservation.paidAmount)})을 넘을 수 없습니다.`); return; }
    startTransition(async () => {
      const res = await cancelReservation(reservation.id, cancelReason, skipPayment, refundAmount);
      if (res.ok) {
        setCancelOpen(false);
        showToast(res.message);
      } else if (res.needsNoPaymentConfirm) {
        setNoPaymentMessage(res.message);
      } else {
        showToast(res.message);
      }
    });
  }

  function onResend() {
    startTransition(async () => {
      const res = await resendAlimtalk(reservation.id);
      showToast(res.message);
    });
  }

  const inputStyle: React.CSSProperties = { border: 0, background: "#F6F3F5", borderRadius: 12, padding: "12px 14px", fontSize: 13.5, color: locked ? "#6E646A" : "#1E1A1C", width: "100%", boxSizing: "border-box" };
  const card: React.CSSProperties = { background: "#FFFFFF", border: "1px solid #EFEBED", borderRadius: 18, padding: 24, boxSizing: "border-box" };
  const divider: React.CSSProperties = { height: 1, background: "#ECE7E9", margin: "16px 0" };
  const dt: React.CSSProperties = { color: "#8C8188" };
  const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12 };
  const amt: React.CSSProperties = { fontWeight: 600, color: "#413A3E" };
  const primaryBtn: React.CSSProperties = { height: 44, padding: "0 20px", border: 0, borderRadius: 12, background: "#B0567E", color: "#FFFFFF", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 6px rgba(176,86,126,0.25)" };
  const outlineBtn: React.CSSProperties = { height: 40, padding: "0 16px", border: "1px solid #D9A3BC", borderRadius: 12, background: "#FFFFFF", color: "#8A3F61", fontSize: 13, fontWeight: 700, cursor: "pointer" };
  const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(fields.date)
    ? formatWishDateLabel(fields.date, fields.time)
    : [fields.date, fields.time].filter(Boolean).join(" ") || reservation.wishDateLabel || "-";
  const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#6E646A" };

  return (
    <main
      className={className}
      style={{
        flex: "1.6 1 280px", minWidth: 0, boxSizing: "border-box", padding: "6px 28px 52px",
        borderLeft: mobile ? "0" : "1px solid #F0EDEF",
        position: mobile ? "fixed" : "static",
        inset: mobile ? 0 : "auto",
        zIndex: mobile ? 40 : "auto",
        background: "#FFFFFF",
        overflowY: mobile ? "auto" : "visible",
      }}
    >
      {mobile && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0 16px" }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#8C8188" }}>예약 상세</span>
          <button onClick={closeDetail} style={{ height: 38, padding: "0 16px", border: 0, borderRadius: 12, background: "#F6F3F5", color: "#6E646A", fontSize: 13.5, fontWeight: 700 }}>닫기</button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.6px", wordBreak: "keep-all" }}>{reservation.customer} 님 · 축의대 대행</h1>
        <span style={{ padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: badge.bg, color: badge.color }}>{reservation.status}</span>
        <span style={{ fontSize: 13, color: "#8C8188" }}>{reservation.id} · 접수 {reservation.createdAtLabel}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1080 }}>
        {/* 1. 상태 안내 */}
        {isCancelled ? (
          <section style={{ ...card, background: "#F4F3F3" }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#413A3E" }}>취소된 예약입니다</div>
            {reservation.cancel && (
              <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.7, color: "#6E686B" }}>
                사유 · {reservation.cancel.reason}
                {reservation.cancel.atLabel && <> · 취소일시 {reservation.cancel.atLabel}</>}
                {" · "}환불 금액 {reservation.cancel.refundAmount ? won(reservation.cancel.refundAmount) : "결제취소 없음"}
              </div>
            )}
          </section>
        ) : isConfirmed ? (
          <section style={{ ...card, background: "#F9EFF4", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: "#7E3855" }}>확정된 예약입니다</div>
              <div style={{ marginTop: 4, fontSize: 12.5, color: "#A87D91", lineHeight: 1.6 }}>
                캘린더 {fields.date} 일정에 등록되었습니다 · 알림톡 발송 {reservation.alimtalkLabel}
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button disabled={isPending} onClick={onResend} style={outlineBtn}>확정 알림톡 재발송</button>
              <button disabled={isPending} onClick={onReopenClick} style={{ ...outlineBtn, borderColor: "#E5DDE1", color: "#6E646A" }}>재협의</button>
            </div>
          </section>
        ) : (
          <section style={{ ...card, background: "#F8F6F7", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: "#413A3E" }}>아직 확정 전인 예약입니다</div>
              <div style={{ marginTop: 4, fontSize: 12.5, color: "#8C8188", lineHeight: 1.6 }}>
                협의 내용을 반영해 예약 내역을 수정한 뒤 확정하세요. 확정 시 알림톡이 발송됩니다.
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {reservation.status === "신규요청" && (
                <button disabled={isPending} onClick={onHoldClick} style={{ ...outlineBtn, borderColor: "#E5DDE1", color: "#6E646A" }}>협의 중으로</button>
              )}
              <button disabled={isPending} onClick={onConfirmClick} style={{ ...primaryBtn, opacity: isPending ? 0.7 : 1 }}>확정하기</button>
            </div>
          </section>
        )}

        {/* 2. 예약 내역 (확정될 값) */}
        <section style={card}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
            <div>
              <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>예약 내역</h2>
              <p style={{ margin: 0, fontSize: 12.5, color: "#A79BA1" }}>
                {editing ? "입력칸을 벗어나면 바로 저장됩니다" : locked ? "확정된 내용입니다. 고치려면 재협의를 눌러 주세요." : "협의 후 확정할 내용입니다"}
              </p>
            </div>
            {!locked && !isCancelled && (
              <button onClick={() => setEditing((v) => !v)} style={editing ? { ...primaryBtn, height: 38, padding: "0 16px", fontSize: 13 } : { ...outlineBtn, height: 38 }}>
                {editing ? "수정 완료" : "예약 내역 수정"}
              </button>
            )}
          </div>

          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.4px" }}>{money.meta.key}</div>
          <div style={{ fontSize: 12.5, color: "#8C8188", marginTop: 5 }}>{money.meta.desc}</div>
          <div style={divider} />

          {editing ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
              <label style={labelStyle}>예식일<input {...field("date")} placeholder="2026-09-19" style={inputStyle} /></label>
              <label style={labelStyle}>예식 시간<input {...field("time")} placeholder="12:00" style={inputStyle} /></label>
              <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>예식장 · 홀<input {...field("venue")} style={inputStyle} /></label>
              <label style={labelStyle}>배정 버틀러 (명)<input {...field("butlers")} style={inputStyle} /></label>
              <label style={labelStyle}>추가 하객 (명)<input {...field("extraGuests")} style={inputStyle} /></label>
              <label style={labelStyle}>할인 금액 (원)<input {...field("discount")} placeholder="0" style={inputStyle} /></label>
              <label style={labelStyle}>결제 방식
                <select
                  value={fields.paymentType}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFields((f) => ({ ...f, paymentType: v }));
                    startTransition(() => { saveConfirmFields(reservation.id, { ...parsedFields, paymentType: v }); });
                  }}
                  style={inputStyle}
                >
                  <option value="">미지정</option>
                  {(Object.keys(PAYMENT_TYPES) as PaymentType[]).map((t) => <option key={t} value={t}>{PAYMENT_TYPES[t].name}</option>)}
                </select>
              </label>
              <label style={labelStyle}>결제한 금액 (원)<input {...field("paidAmount")} placeholder="0" style={inputStyle} /></label>
              <label style={labelStyle}>근무 시간<input {...field("hours")} style={inputStyle} /></label>
              <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>특이사항<textarea rows={3} {...field("note")} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} /></label>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr)", gap: "13px 16px", fontSize: 13.5 }}>
              <span style={dt}>예식 일시</span><span style={{ fontWeight: 600 }}>{dateLabel}</span>
              <span style={dt}>예식장</span><span>{fields.venue || reservation.venueLabel || "-"}</span>
              <span style={dt}>배정 버틀러</span><span>{parsedFields.butlers}명</span>
              <span style={dt}>예상 하객</span><span>{reservation.guestsLabel || "-"}</span>
              <span style={dt}>예약자</span><span>{reservation.couple}{reservation.side ? ` (${reservation.side})` : ""} · {reservation.phone}</span>
              {reservation.memo && (<><span style={dt}>요청 사항</span><span style={{ lineHeight: 1.6 }}>{reservation.memo}</span></>)}
              {reservation.customerMemo && (<><span style={dt}>고객 메모</span><span style={{ lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{reservation.customerMemo}</span></>)}
              {fields.hours && (<><span style={dt}>근무 시간</span><span>{fields.hours}</span></>)}
              {fields.note && (<><span style={dt}>특이사항</span><span style={{ lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{fields.note}</span></>)}
            </div>
          )}

          <div style={divider} />

          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13, color: "#6E646A" }}>
            <div style={row}><span>기본 요금</span><span style={amt}>{won(money.meta.base)}</span></div>
            <div style={row}><span>추가 하객 {parsedFields.extraGuests}명</span><span style={amt}>{money.guestFee ? won(money.guestFee) : "-"}</span></div>
            <div style={row}><span>버틀러 추가 {money.extraButlers}명</span><span style={amt}>{money.butlerFee ? won(money.butlerFee) : "-"}</span></div>
            {money.discount > 0 && <div style={row}><span>할인 금액</span><span style={{ ...amt, color: "#A8416C" }}>-{won(money.discount)}</span></div>}
            <div style={{ ...row, paddingTop: 10, borderTop: "1px solid #ECE7E9" }}><span>총 금액 (부가세 포함)</span><span style={{ fontWeight: 700, color: "#413A3E" }}>{won(money.total)}</span></div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginTop: 16 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "#7E3855" }}>{paymentTypeName(parsedFields.paymentType, parsedFields.paidAmount, money.total)}</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: "#7E3855" }}>{won(parsedFields.paidAmount)}</span>
          </div>
          <div style={{ fontSize: 12, color: "#9E7286", marginTop: 4, textAlign: "right" }}>결제한 금액</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginTop: 12, fontSize: 13.5 }}>
            <span style={{ color: "#6E646A" }}>현장결제 금액 <span style={{ fontSize: 12, color: "#A79BA1" }}>(예식 당일 현금)</span></span>
            <span style={{ fontWeight: 700, color: "#413A3E" }}>{won(onsiteAmount(money.total, parsedFields.paidAmount))}</span>
          </div>

          <details style={{ marginTop: 18, padding: "12px 14px", borderRadius: 12, background: "#F8F6F7", fontSize: 13, color: "#6E646A" }}>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>고객 신청 원본 (홈페이지에서 신청한 내용)</summary>
            <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr)", gap: "9px 16px", marginTop: 12 }}>
              <span style={dt}>플랜</span><span>{req.meta.key}</span>
              <span style={dt}>예식 일시</span><span>{reservation.wishDateLabel || "-"}</span>
              <span style={dt}>예식장</span><span>{reservation.venueLabel || "-"}</span>
              <span style={dt}>버틀러</span><span>{req.meta.butlers + reservation.requestedExtraButlers}명{reservation.requestedExtraButlers ? ` (추가 ${reservation.requestedExtraButlers}명)` : ""}</span>
              <span style={dt}>신청 금액</span><span>{won(req.total)}{req.fromHomepage && req.extraGuests ? " · 초과 하객은 당일 정산" : ""}</span>
              <span style={dt}>결제</span><span>{paymentTypeName(reservation.paymentType, reservation.paidAmount, req.total)} · {won(reservation.paidAmount)}</span>
            </div>
          </details>
        </section>

        {/* 3. 협의 내용 */}
        <section style={card}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 10px", marginBottom: 18 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>협의 내용</h2>
            <span style={{ fontSize: 12.5, color: "#A79BA1" }}>유선으로 협의된 고객 요청 내용을 기록하세요</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingLeft: 2 }}>
            {reservation.notes.map((t) => (
              <div key={t.id} style={{ display: "flex", gap: 12 }}>
                <div style={{ width: 9, height: 9, flex: "0 0 9px", borderRadius: "50%", border: "2px solid #DCC4CF", boxSizing: "border-box", marginTop: 4 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#A79BA1", fontWeight: 600, marginBottom: 5 }}>{t.when}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.65, color: "#373135", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{t.text}</div>
                </div>
              </div>
            ))}
            {reservation.notes.length === 0 && <div style={{ fontSize: 13, color: "#A79BA1" }}>아직 기록된 협의 내용이 없습니다.</div>}
          </div>

          <div style={{ marginTop: 20, background: "#F8F6F7", borderRadius: 16, padding: 14 }}>
            <textarea
              rows={3}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="고객 요청 내용을 입력하세요 (예: 인원 4명 → 3명으로 조정 요청, 금액 36만원 합의)"
              style={{ width: "100%", boxSizing: "border-box", border: 0, background: "#FFFFFF", borderRadius: 12, padding: "12px 14px", fontSize: 13.5, color: "#1E1A1C", lineHeight: 1.6, resize: "vertical", fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <button disabled={isPending} onClick={onAddNote} style={{ ...primaryBtn, height: 40, opacity: isPending ? 0.7 : 1 }}>협의 기록 추가</button>
            </div>
          </div>
        </section>

        {/* 4. 축의 기록 (확정된 예약만) */}
        {isConfirmed && (
          <section style={{ ...card, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, flex: "0 0 40px", borderRadius: 12, background: "#F6F3F5", display: "flex", alignItems: "center", justifyContent: "center", color: "#8A3F61" }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect x="4" y="2.8" width="12" height="14.4" rx="2.6" stroke="currentColor" strokeWidth="1.7" />
                <path d="M7.4 8h5.2M7.4 11.4h3.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </div>
            <div style={{ flex: "1 1 180px", minWidth: 0, fontSize: 13, lineHeight: 1.55 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: "#413A3E" }}>축의 기록</div>
              <span style={{ color: "#8C8188" }}>{RECORD_STATUS_TEXT[reservation.recordStatus]}</span>
            </div>
            <Link href={`/reservations/${reservation.id}/record`} target="_blank" rel="noopener" style={{ ...outlineBtn, display: "inline-flex", alignItems: "center" }}>
              {reservation.recordStatus === "none" ? "기록 만들기" : "기록 관리"}
            </Link>
          </section>
        )}

        {/* 예약 취소 */}
        {!isCancelled && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button disabled={isPending} onClick={openCancel} style={{ height: 36, padding: "0 4px", border: 0, background: "transparent", color: "#B04A4A", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              예약 취소
            </button>
          </div>
        )}
      </div>

      {cancelOpen && (
        <div onClick={() => !isPending && setCancelOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(30,26,28,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, background: "#FFFFFF", borderRadius: 18, padding: 24, boxSizing: "border-box" }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 800 }}>예약 취소</h2>
            <p style={{ margin: "0 0 18px", fontSize: 13, lineHeight: 1.6, color: "#6E646A" }}>
              {reservation.customer} 님 예약({reservation.id})을 취소하고, 이니시스에 아래 환불 금액만큼 결제취소를 요청합니다. 고객에게 취소 알림톡이 갑니다. 결제취소는 되돌릴 수 없습니다.
            </p>

            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#6E646A", marginBottom: 8 }}>환불 금액</div>
            <input
              inputMode="numeric"
              value={refundDraft}
              onChange={(e) => setRefundDraft(e.target.value.replace(/[^0-9]/g, ""))}
              style={{ ...inputStyle, color: "#1E1A1C", marginBottom: 6 }}
            />
            <p style={{ margin: "0 0 18px", fontSize: 12, lineHeight: 1.6, color: "#8A8086" }}>
              결제 {won(reservation.paidAmount)} · 약관 기준 {quote.label} {won(quote.amount)}. 재배정·회사 사정·천재지변 등은 전액으로 고쳐 주세요. 0원이면 결제취소 없이 예약만 취소합니다.
            </p>

            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#6E646A", marginBottom: 8 }}>취소 사유</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="radio" name="cancelReason" checked={reasonType === "고객요청"} onChange={() => setReasonType("고객요청")} />
                고객요청
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="radio" name="cancelReason" checked={reasonType === "직접입력"} onChange={() => setReasonType("직접입력")} />
                직접 입력
              </label>
              {reasonType === "직접입력" && (
                <textarea
                  rows={3}
                  autoFocus
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="취소 사유를 입력하세요"
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
                />
              )}
            </div>

            {noPaymentMessage && (
              <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "#FFF6E8", fontSize: 13, lineHeight: 1.6, color: "#7D5A1F" }}>
                {noPaymentMessage}<br />결제취소 없이 예약만 취소할까요?
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button disabled={isPending} onClick={() => setCancelOpen(false)} style={{ flex: 1, height: 46, border: 0, borderRadius: 12, background: "#F6F3F5", color: "#6E646A", fontSize: 14, fontWeight: 600 }}>닫기</button>
              <button
                disabled={isPending || !cancelReason}
                onClick={() => onCancelSubmit(Boolean(noPaymentMessage))}
                style={{ flex: 1.4, height: 46, border: 0, borderRadius: 12, background: "#B04A4A", color: "#fff", fontSize: 14, fontWeight: 700, opacity: isPending || !cancelReason ? 0.6 : 1 }}
              >
                {isPending ? "처리 중…" : noPaymentMessage || refundAmount === 0 ? "예약만 취소" : `취소하고 ${won(refundAmount)} 환불`}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
