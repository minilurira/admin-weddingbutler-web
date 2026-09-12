"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calcConfirm, requestedTotal, won } from "@/lib/pricing";
import { BADGE } from "@/lib/badge";
import { toNum } from "@/lib/format";
import { useIsMobile } from "@/lib/useIsMobile";
import { useToast } from "./ToastContext";
import { confirmReservation, holdReservation, addNote, resendAlimtalk, saveConfirmFields } from "@/lib/actions";

export interface DetailNote {
  id: string;
  when: string;
  text: string;
}

export interface DetailReservation {
  id: string;
  customer: string;
  couple: string;
  phone: string;
  createdAtLabel: string;
  wishDateLabel: string;
  venueLabel: string;
  guestsLabel: string;
  memo: string;
  status: string;
  requestedPlan: string;
  alimtalkLabel: string;
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

  const [fields, setFields] = useState({
    date: reservation.confirm.date,
    time: reservation.confirm.time,
    venue: reservation.confirm.venue,
    butlers: String(reservation.confirm.butlers),
    extraGuests: String(reservation.confirm.extraGuests),
    discount: String(reservation.confirm.discount),
    hours: reservation.confirm.hours,
    note: reservation.confirm.note,
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
    }),
    [fields]
  );

  const money = useMemo(() => calcConfirm({ plan: reservation.confirm.plan, butlers: parsedFields.butlers, extraGuests: parsedFields.extraGuests, discount: parsedFields.discount }), [reservation.confirm.plan, parsedFields]);
  const req = useMemo(() => requestedTotal(reservation.requestedPlan, reservation.guestsLabel), [reservation.requestedPlan, reservation.guestsLabel]);

  const badge = BADGE[reservation.status] ?? BADGE["신규요청"];
  const isConfirmed = reservation.status === "확정";

  function field(key: keyof typeof fields) {
    return {
      value: fields[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFields((f) => ({ ...f, [key]: e.target.value })),
      onBlur: () => startTransition(() => { saveConfirmFields(reservation.id, parsedFields); }),
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

  function onAddNote() {
    if (!noteDraft.trim()) { showToast("협의 내용을 입력해 주세요."); return; }
    startTransition(async () => {
      const res = await addNote(reservation.id, noteDraft);
      if (res.ok) setNoteDraft("");
      showToast(res.message);
    });
  }

  function onResend() {
    startTransition(async () => {
      const res = await resendAlimtalk(reservation.id);
      showToast(res.message);
    });
  }

  const inputStyle: React.CSSProperties = { border: 0, background: "#F6F3F5", borderRadius: 12, padding: "12px 14px", fontSize: 13.5, color: "#1E1A1C", width: "100%", boxSizing: "border-box" };
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 20, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <section style={{ background: "#F8F6F7", borderRadius: 18, padding: 24 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>예약 내역</h2>
            <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "#A79BA1" }}>고객이 홈페이지에서 신청한 내용입니다</p>

            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.4px" }}>{req.meta.key}</div>
            <div style={{ fontSize: 12.5, color: "#8C8188", marginTop: 5 }}>{req.meta.desc}</div>
            <div style={{ height: 1, background: "#ECE7E9", margin: "16px 0" }} />

            <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr)", gap: "13px 16px", fontSize: 13.5 }}>
              <span style={{ color: "#8C8188" }}>예식 일시</span><span style={{ fontWeight: 600 }}>{reservation.wishDateLabel}</span>
              <span style={{ color: "#8C8188" }}>예식장</span><span>{reservation.venueLabel}</span>
              <span style={{ color: "#8C8188" }}>배정 버틀러</span><span>{req.meta.butlers}명</span>
              <span style={{ color: "#8C8188" }}>예상 하객</span><span>{reservation.guestsLabel}</span>
              <span style={{ color: "#8C8188" }}>예약자</span><span>{reservation.couple} · {reservation.phone}</span>
              <span style={{ color: "#8C8188" }}>요청 사항</span><span style={{ lineHeight: 1.6 }}>{reservation.memo}</span>
            </div>

            <div style={{ height: 1, background: "#ECE7E9", margin: "16px 0" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13, color: "#6E646A" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span>기본 요금</span><span style={{ fontWeight: 600, color: "#413A3E" }}>{won(req.meta.base)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span>추가 하객 {req.extraGuests}명</span><span style={{ fontWeight: 600, color: "#413A3E" }}>{req.guestFee ? won(req.guestFee) : "-"}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span>버틀러 추가</span><span style={{ fontWeight: 600, color: "#413A3E" }}>-</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, paddingTop: 10, borderTop: "1px solid #ECE7E9" }}><span>총 금액 (부가세 포함)</span><span style={{ fontWeight: 700, color: "#413A3E" }}>{won(req.total)}</span></div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginTop: 14 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "#7E3855" }}>선결제 50%</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#7E3855" }}>{won(req.prepay)}</span>
            </div>
            <div style={{ fontSize: 12, color: "#9E7286", marginTop: 6, textAlign: "right" }}>예식 후 잔금 {won(req.balance)}</div>
          </section>

          <section style={{ padding: "0 4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>협의 내용</h2>
              <span style={{ fontSize: 12.5, color: "#A79BA1" }}>유선으로 협의된 고객 요청 내용을 기록하세요</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {reservation.notes.map((t) => (
                <div key={t.id} style={{ display: "flex", gap: 12 }}>
                  <div style={{ width: 8, height: 8, flex: "0 0 8px", borderRadius: "50%", background: "#DCC4CF", marginTop: 7 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#A79BA1", fontWeight: 600, marginBottom: 5 }}>{t.when}</div>
                    <div style={{ fontSize: 13.5, lineHeight: 1.65, color: "#373135" }}>{t.text}</div>
                  </div>
                </div>
              ))}
              {reservation.notes.length === 0 && <div style={{ fontSize: 13, color: "#A79BA1" }}>아직 기록된 협의 내용이 없습니다.</div>}
            </div>

            <div style={{ marginTop: 20, background: "#F8F6F7", borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#6E646A", marginBottom: 10 }}>고객 요청 기록</div>
              <textarea
                rows={3}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="고객 요청 내용을 입력하세요 (예: 인원 4명 → 3명으로 조정 요청, 금액 36만원 합의)"
                style={{ width: "100%", boxSizing: "border-box", border: 0, background: "#FFFFFF", borderRadius: 12, padding: "12px 14px", fontSize: 13.5, color: "#1E1A1C", lineHeight: 1.6, resize: "vertical" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <button disabled={isPending} onClick={onAddNote} style={{ height: 40, padding: "0 18px", border: 0, borderRadius: 12, background: "#B0567E", color: "#fff", fontSize: 13.5, fontWeight: 700, opacity: isPending ? 0.7 : 1 }}>
                  협의 기록 추가
                </button>
              </div>
            </div>
          </section>
        </div>

        <section style={{ background: "#FFFFFF", border: "1px solid #EFEBED", borderRadius: 18, padding: 24 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>확정 내용</h2>
          <p style={{ margin: "0 0 20px", fontSize: 12.5, color: "#8C8188" }}>협의된 내용을 최종 입력한 뒤 확정하세요.</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 14 }}>
            <label style={labelStyle}>예식일<input {...field("date")} style={inputStyle} /></label>
            <label style={labelStyle}>예식 시간<input {...field("time")} style={inputStyle} /></label>
            <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>예식장 · 홀<input {...field("venue")} style={inputStyle} /></label>
            <label style={labelStyle}>배정 버틀러 (명)<input {...field("butlers")} style={inputStyle} /></label>
            <label style={labelStyle}>추가 하객 (명)<input {...field("extraGuests")} style={inputStyle} /></label>
            <label style={labelStyle}>할인 금액 (원)<input {...field("discount")} placeholder="0" style={inputStyle} /></label>
            <label style={labelStyle}>근무 시간<input {...field("hours")} style={inputStyle} /></label>
            <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>특이사항<textarea rows={3} {...field("note")} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} /></label>
          </div>

          <div style={{ marginTop: 22, background: "#F7EDF2", borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#7E3855" }}>{money.meta.key}</div>
            <div style={{ fontSize: 12.5, color: "#9E7286", marginTop: 4 }}>{money.meta.desc}</div>
            <div style={{ height: 1, background: "#EBD5DF", margin: "14px 0" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 13, color: "#6E5A62" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span>기본 요금</span><span style={{ fontWeight: 600, color: "#413A3E" }}>{won(money.meta.base)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span>추가 하객 {parsedFields.extraGuests}명</span><span style={{ fontWeight: 600, color: "#413A3E" }}>{money.guestFee ? won(money.guestFee) : "-"}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span>버틀러 추가 {money.extraButlers}명</span><span style={{ fontWeight: 600, color: "#413A3E" }}>{money.butlerFee ? won(money.butlerFee) : "-"}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span>할인 금액</span><span style={{ fontWeight: 600, color: "#A8416C" }}>{money.discount ? "-" + won(money.discount) : "-"}</span></div>
            </div>
            <div style={{ height: 1, background: "#EBD5DF", margin: "14px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5 }}><span style={{ color: "#6E5A62" }}>총 금액 (부가세 포함)</span><span style={{ fontWeight: 700 }}>{won(money.total)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginTop: 12 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "#7E3855" }}>선결제 50%</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: "#7E3855" }}>{won(money.prepay)}</span>
            </div>
            <div style={{ fontSize: 12, color: "#9E7286", marginTop: 6, textAlign: "right" }}>예식 후 잔금 {won(money.balance)}</div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
            <button disabled={isPending} onClick={onConfirmClick} style={{ flex: 1, height: 52, border: 0, borderRadius: 14, background: "#B0567E", color: "#fff", fontSize: 15, fontWeight: 700, opacity: isPending ? 0.7 : 1 }}>
              {isConfirmed ? "확정 내용 저장" : "확정하기"}
            </button>
            <button disabled={isPending} onClick={onHoldClick} style={{ height: 52, padding: "0 20px", border: 0, borderRadius: 14, background: "#F6F3F5", color: "#6E646A", fontSize: 14.5, fontWeight: 600 }}>협의 중</button>
          </div>

          {isConfirmed && (
            <div style={{ marginTop: 14, padding: 15, borderRadius: 12, background: "#F9EFF4", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
              <div style={{ flex: "1 1 180px", minWidth: 0, color: "#8A3F61", fontSize: 13, fontWeight: 600, lineHeight: 1.55 }}>
                확정 완료 · 캘린더 {fields.date} 일정에 등록되었습니다.<br />
                <span style={{ color: "#A87D91", fontWeight: 500 }}>알림톡 발송 {reservation.alimtalkLabel}</span>
              </div>
              <button disabled={isPending} onClick={onResend} style={{ flex: "0 0 auto", height: 40, padding: "0 16px", border: "1px solid #D9A3BC", borderRadius: 12, background: "#FFFFFF", color: "#8A3F61", fontSize: 13, fontWeight: 700 }}>
                확정 알림톡 재발송
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
