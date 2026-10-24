"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PAYMENT_TYPES, PLANS, SIDES, paymentLinkDefaultAmount, won, type PaymentType } from "@/lib/pricing";
import { bookedTimes, createReservation } from "@/lib/actions";
import { listOpenInquiries, type OpenInquiry } from "@/lib/inquiryActions";
import { formatPhone, formatStamp, parseLooseDate, TIME_SLOTS, toNum } from "@/lib/format";
import { useToast } from "./ToastContext";
import { useIsMobile } from "@/lib/useIsMobile";

const FILTERS = ["전체", "신규요청", "협의중", "확정", "취소"];

const EMPTY_FORM = {
  customer: "", couple: "", side: "", phone: "", date: "", time: "", venueLabel: "", guestsLabel: "", memo: "", requestedPlan: PLANS[1].key, paymentType: "",
};

export default function ReservationListControls({ currentFilter, counts }: { currentFilter: string; counts: Record<string, number> }) {
  const mobile = useIsMobile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendLink, setSendLink] = useState(false);
  const [linkAmount, setLinkAmount] = useState("");
  const [linkDays, setLinkDays] = useState("3");
  const [form, setForm] = useState<{
    customer: string; couple: string; side: string; phone: string; date: string; time: string; venueLabel: string; guestsLabel: string; memo: string; requestedPlan: string; paymentType: string;
  }>(EMPTY_FORM);
  const [booked, setBooked] = useState<string[]>([]);
  const [inquiryId, setInquiryId] = useState<string | null>(null);
  const [inquiries, setInquiries] = useState<OpenInquiry[] | null>(null);
  const [inquiryLoading, setInquiryLoading] = useState(false);
  const [showAllInquiries, setShowAllInquiries] = useState(false);
  const [pickedHandled, setPickedHandled] = useState(false);
  const visibleInquiries = inquiries ? inquiries.filter((q) => showAllInquiries || !q.handled) : null;

  async function onDateChange(date: string) {
    setForm((f) => ({ ...f, date }));
    setBooked(date ? await bookedTimes(date) : []);
  }

  async function openInquiries() {
    if (inquiries) { setInquiries(null); return; }
    setInquiryLoading(true);
    const res = await listOpenInquiries();
    setInquiryLoading(false);
    if (!res.ok) { showToast(res.message); return; }
    if (res.items.length === 0) { showToast("문의가 없습니다."); return; }
    setShowAllInquiries(!res.items.some((q) => !q.handled));
    setInquiries(res.items);
  }

  function pickInquiry(q: OpenInquiry) {
    const date = parseLooseDate(q.ceremonyDate);
    setForm((f) => ({ ...f, customer: q.name, couple: q.name, phone: formatPhone(q.phone), date: date || f.date, time: date ? "" : f.time }));
    if (date) void onDateChange(date);
    setInquiryId(q.id);
    setPickedHandled(q.handled);
    setInquiries(null);
    showToast(date || !q.ceremonyDate ? `${q.name} 님 문의를 가져왔습니다.` : `${q.name} 님 문의를 가져왔습니다. 예식일(${q.ceremonyDate})은 직접 골라 주세요.`);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setBooked([]);
    setInquiryId(null);
    setInquiries(null);
    setSendLink(false);
    setLinkAmount("");
    setLinkDays("3");
  }

  function filterHref(label: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("id");
    if (label === "전체") params.delete("filter");
    else params.set("filter", label);
    return `/reservations?${params.toString()}`;
  }

  async function onSubmit() {
    if (!form.customer.trim() || !form.phone.trim()) {
      showToast("고객명과 연락처를 입력해 주세요.");
      return;
    }
    if (!form.date) {
      showToast("예식 날짜를 골라 주세요.");
      return;
    }
    const amount = linkAmount ? toNum(linkAmount) : paymentLinkDefaultAmount(form.requestedPlan, form.paymentType);
    if (sendLink && !window.confirm(`등록하고 ${form.customer.trim()} 님(${form.phone.trim()})에게 ${won(amount)} 결제 링크를 보낼까요?`)) return;
    setSaving(true);
    const res = await createReservation({
      ...form,
      inquiryId: inquiryId ?? undefined,
      paymentLink: sendLink ? { amount, days: toNum(linkDays) || 3 } : undefined,
    });
    setSaving(false);
    setOpen(false);
    resetForm();
    showToast(res.linkMessage ? `새 예약을 등록했습니다. ${res.linkMessage}` : "새 예약이 등록되었습니다.");
    router.push(`/reservations?id=${res.id}`);
  }

  const inputStyle: React.CSSProperties = { border: 0, background: "#F6F3F5", borderRadius: 12, padding: "12px 14px", fontSize: 13.5, color: "#1E1A1C", width: "100%", boxSizing: "border-box" };

  return (
    <>
      {/* 제목 줄: 예약 N건 · 새 예약 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "6px 0 14px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.4px" }}>예약</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#B0567E" }}>{counts["전체"] ?? 0}건</span>
        </div>
        <button onClick={() => setOpen(true)} style={{ height: 40, padding: "0 16px", border: 0, borderRadius: 12, background: "#B0567E", color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 6px rgba(176,86,126,0.25)" }}>
          + 새 예약
        </button>
      </div>

      {/* 상태 필터: 회색 바 안의 탭 */}
      <div style={{ display: "flex", gap: 4, padding: 4, marginBottom: 14, borderRadius: 14, background: "#F4F1F3", overflowX: "auto" }}>
        {FILTERS.map((label) => {
          const active = currentFilter === label;
          return (
            <Link
              key={label}
              href={filterHref(label)}
              style={{
                flex: mobile ? "0 0 auto" : "1 1 0", minWidth: 0, height: 38, padding: "0 12px", borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5, whiteSpace: "nowrap",
                background: active ? "#FFFFFF" : "transparent",
                boxShadow: active ? "0 1px 3px rgba(60,30,45,0.12)" : "none",
                color: active ? "#B0567E" : "#7A6F75",
                fontSize: 13.5, fontWeight: active ? 800 : 600,
              }}
            >
              {label === "신규요청" ? "신규" : label}
              <span style={{ fontSize: 12, fontWeight: 700, color: active ? "#B0567E" : "#A79BA1" }}>{counts[label] ?? 0}</span>
            </Link>
          );
        })}
      </div>

      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(40,26,33,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto", background: "#FFFFFF", borderRadius: 18, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "0 0 18px" }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>새 예약 등록</h2>
              <button type="button" disabled={inquiryLoading} onClick={openInquiries} style={{ height: 36, padding: "0 12px", border: "1px solid #D9A3BC", borderRadius: 10, background: "#FFFFFF", color: "#8A3F61", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                {inquiryLoading ? "불러오는 중…" : inquiries ? "닫기" : "문의에서 가져오기"}
              </button>
            </div>
            {visibleInquiries && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto", marginBottom: 16, padding: 8, borderRadius: 12, background: "#F8F6F7" }}>
                <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 10, background: "#EEE9EC" }}>
                  {([false, true] as const).map((all) => (
                    <button key={String(all)} type="button" onClick={() => setShowAllInquiries(all)} style={{ flex: 1, height: 30, border: 0, borderRadius: 8, background: showAllInquiries === all ? "#FFFFFF" : "transparent", color: showAllInquiries === all ? "#8A3F61" : "#7A6F75", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                      {all ? `전체 ${inquiries?.length ?? 0}` : `미처리 ${inquiries?.filter((q) => !q.handled).length ?? 0}`}
                    </button>
                  ))}
                </div>
                {visibleInquiries.length === 0 && <div style={{ padding: "10px 4px", fontSize: 12.5, color: "#8C8188" }}>미처리 문의가 없습니다.</div>}
                {visibleInquiries.map((q) => (
                  <button key={q.id} type="button" onClick={() => pickInquiry(q)} style={{ textAlign: "left", border: 0, borderRadius: 10, background: "#FFFFFF", padding: "10px 12px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1E1A1C" }}>
                      {q.name} <span style={{ fontWeight: 500, color: "#6E646A" }}>· {formatPhone(q.phone)}</span>
                      {q.handled && <span style={{ marginLeft: 6, padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#F1EEEF", color: "#8C8188" }}>처리완료</span>}
                    </span>
                    <span style={{ fontSize: 12, color: "#8C8188" }}>{q.topic} · 예식일 {q.ceremonyDate || "-"} · 접수 {formatStamp(new Date(q.createdAt))}</span>
                  </button>
                ))}
              </div>
            )}
            {inquiryId && !inquiries && (
              <div style={{ marginBottom: 14, fontSize: 12, color: "#8A3F61" }}>{pickedHandled ? "처리완료된 문의에서 가져온 예약이에요. 등록하면 문의 메모에 예약번호가 남습니다." : "문의에서 가져온 예약이에요. 등록하면 그 문의는 처리완료로 바뀝니다."}</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#6E646A", display: "flex", flexDirection: "column", gap: 6 }}>
                예약자(신부/신랑) <input style={inputStyle} value={form.couple} onChange={(e) => setForm((f) => ({ ...f, couple: e.target.value }))} placeholder="박준호 · 이서연" />
              </label>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#6E646A", display: "flex", flexDirection: "column", gap: 6 }}>
                축의대 구분
                <select style={inputStyle} value={form.side} onChange={(e) => setForm((f) => ({ ...f, side: e.target.value }))}>
                  <option value="">미지정</option>
                  {SIDES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#6E646A", display: "flex", flexDirection: "column", gap: 6 }}>
                고객명(대표) <input style={inputStyle} value={form.customer} onChange={(e) => setForm((f) => ({ ...f, customer: e.target.value }))} placeholder="이서연" />
              </label>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#6E646A", display: "flex", flexDirection: "column", gap: 6 }}>
                연락처 <input style={inputStyle} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" />
              </label>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#6E646A", display: "flex", flexDirection: "column", gap: 6 }}>
                예식 일시
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="date" style={{ ...inputStyle, flex: "1.4 1 0" }} value={form.date} onChange={(e) => void onDateChange(e.target.value)} />
                  <select style={{ ...inputStyle, flex: "1 1 0" }} value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}>
                    <option value="">시간 미정</option>
                    {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}{booked.includes(t) ? " (예약 있음)" : ""}</option>)}
                  </select>
                </div>
                {booked.length > 0 && <span style={{ fontSize: 11.5, fontWeight: 500, color: "#A0632E" }}>이 날 예약: {booked.join(", ")}</span>}
              </label>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#6E646A", display: "flex", flexDirection: "column", gap: 6 }}>
                예식장 <input style={inputStyle} value={form.venueLabel} onChange={(e) => setForm((f) => ({ ...f, venueLabel: e.target.value }))} placeholder="더채플앳청담 · 그랜드홀" />
              </label>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#6E646A", display: "flex", flexDirection: "column", gap: 6 }}>
                예상 하객 <input style={inputStyle} value={form.guestsLabel} onChange={(e) => setForm((f) => ({ ...f, guestsLabel: e.target.value }))} placeholder="약 300명" />
              </label>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#6E646A", display: "flex", flexDirection: "column", gap: 6 }}>
                요금제
                <select style={inputStyle} value={form.requestedPlan} onChange={(e) => setForm((f) => ({ ...f, requestedPlan: e.target.value }))}>
                  {PLANS.map((p) => <option key={p.key} value={p.key}>{p.key} ({p.desc})</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#6E646A", display: "flex", flexDirection: "column", gap: 6 }}>
                결제 방식
                <select style={inputStyle} value={form.paymentType} onChange={(e) => setForm((f) => ({ ...f, paymentType: e.target.value }))}>
                  <option value="">미지정</option>
                  {(Object.keys(PAYMENT_TYPES) as PaymentType[]).map((t) => <option key={t} value={t}>{PAYMENT_TYPES[t].name}</option>)}
                </select>
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 12, background: "#F9F4F7" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, color: "#7E3855" }}>
                  <input type="checkbox" checked={sendLink} onChange={(e) => setSendLink(e.target.checked)} />
                  결제 링크 보내기 <span style={{ fontSize: 12, fontWeight: 500, color: "#A79BA1" }}>등록 후 고객에게 알림톡으로</span>
                </label>
                {sendLink && (
                  <div style={{ display: "flex", gap: 10 }}>
                    <label style={{ flex: 2, fontSize: 12.5, fontWeight: 600, color: "#6E646A", display: "flex", flexDirection: "column", gap: 6 }}>
                      청구 금액 (원)
                      <input
                        style={{ ...inputStyle, background: "#FFFFFF" }}
                        inputMode="numeric"
                        value={linkAmount}
                        onChange={(e) => setLinkAmount(e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder={String(paymentLinkDefaultAmount(form.requestedPlan, form.paymentType))}
                      />
                    </label>
                    <label style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: "#6E646A", display: "flex", flexDirection: "column", gap: 6 }}>
                      유효기간
                      <select style={{ ...inputStyle, background: "#FFFFFF" }} value={linkDays} onChange={(e) => setLinkDays(e.target.value)}>
                        {[1, 2, 3, 5, 7, 14].map((d) => <option key={d} value={d}>{d}일</option>)}
                      </select>
                    </label>
                  </div>
                )}
                {sendLink && (
                  <div style={{ fontSize: 12, color: "#8C8188", lineHeight: 1.5 }}>
                    비워 두면 {won(paymentLinkDefaultAmount(form.requestedPlan, form.paymentType))} ({form.paymentType === "full" ? "전액결제" : "예약금"}). 고객이 결제하면 결제한 금액에 자동으로 더해집니다.
                  </div>
                )}
              </div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#6E646A", display: "flex", flexDirection: "column", gap: 6 }}>
                요청 사항 <textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => { setOpen(false); resetForm(); }} style={{ flex: 1, height: 48, border: 0, borderRadius: 12, background: "#F6F3F5", color: "#6E646A", fontSize: 14, fontWeight: 700 }}>취소</button>
              <button disabled={saving} onClick={onSubmit} style={{ flex: 1, height: 48, border: 0, borderRadius: 12, background: "#B0567E", color: "#fff", fontSize: 14, fontWeight: 700, opacity: saving ? 0.7 : 1 }}>등록</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
