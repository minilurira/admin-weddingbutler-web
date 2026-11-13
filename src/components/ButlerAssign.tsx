"use client";

import { useCallback, useEffect, useState } from "react";
import { assignButler, getAssignment, setAssignmentSide, unassignButler } from "@/lib/assignActions";
import { getMessages } from "@/lib/messageActions";
import type { MessageView } from "@/lib/messageView";
import { formatStamp } from "@/lib/format";
import type { AssignedView, AssignmentView } from "@/lib/assign";
import { updateShiftGrade } from "@/lib/financeActions";
import { BUTLER_GRADES, OWNER_HEADCOUNT, OWNER_SPLIT, ownerPool, shiftTotal, splitOwnerPay, type ButlerGrade } from "@/lib/financeCalc";
import { deskSideOptions, won } from "@/lib/pricing";
import { useToast } from "./ToastContext";

const GRADES = Object.keys(BUTLER_GRADES) as ButlerGrade[];
const selectStyle: React.CSSProperties = { border: 0, background: "#F6F3F5", borderRadius: 10, padding: "9px 10px", fontSize: 13, color: "#1E1A1C", minWidth: 0 };

/** 버틀러 업무 배정 알림톡 상태 표시. 보낸 기록이 없으면 언제 나갈지 안내한다 (규칙은 src/lib/butlerNotice.ts). */
function noticeStatus(notice: MessageView | undefined, hasPhone: boolean, date: string): { text: string; bg: string; color: string } {
  const ok = { bg: "#E3F1E8", color: "#2B6A45" }, bad = { bg: "#F7E4E4", color: "#A8416C" }, wait = { bg: "#EEECED", color: "#6E646A" };
  if (notice?.status === "sent") return { text: `보냄 ${formatStamp(new Date(notice.createdAt))}`, ...ok };
  if (notice?.status === "failed") return { text: `실패${notice.detail ? ` (${notice.detail})` : ""} · 매일 10시 재시도`, ...bad };
  if (!hasPhone) return { text: "휴대폰 번호 미등록", ...bad };
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // 한국 날짜
  if (!date || date < today) return { text: "보내지 않음", ...wait };
  if (date.slice(0, 7) > today.slice(0, 7)) return { text: `${Number(date.slice(5, 7))}월 1일 10시 발송 예정`, ...wait };
  return { text: "10시 자동 발송 예정", ...wait };
}

/** 예약 상세의 "버틀러 배정" 카드. 필요한 인원(예약 내역의 배정 버틀러 수)만큼 실제 버틀러를 정한다. */
export default function ButlerAssign({ reservationId, required, cancelled, card }: { reservationId: string; required: number; cancelled: boolean; card: React.CSSProperties }) {
  const toast = useToast();
  const [data, setData] = useState<AssignmentView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState("");
  const [pickGrade, setPickGrade] = useState("");
  const [pickSide, setPickSide] = useState("");
  const [notices, setNotices] = useState<MessageView[]>([]);
  const [openNotice, setOpenNotice] = useState("");

  const load = useCallback(() => {
    getAssignment(reservationId).then((d) => { setData(d); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "배정 정보를 불러오지 못했습니다."));
    // 버틀러별 업무 배정 알림톡 발송 상태·내용 (발송 내역에서 가져온다)
    getMessages(reservationId).then((rows) => setNotices(rows.filter((m) => m.kind === "버틀러 업무 배정"))).catch(() => setNotices([]));
  }, [reservationId]);
  useEffect(() => { setData(null); load(); }, [load]);

  async function run(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    try { const res = await fn(); toast(typeof res === "string" ? res : okMsg); load(); } catch (e) { toast(e instanceof Error ? e.message : "처리하지 못했습니다."); } finally { setBusy(false); }
  }

  const assigned = data?.assigned ?? [];
  const free = (data?.butlers ?? []).filter((b) => !assigned.some((a) => a.butlerId === b.id));
  const sel = free.find((b) => b.id === pick) ?? free[0];
  const grade = pickGrade || sel?.grade || "staff";
  const full = assigned.length >= required;
  // 양가 예약이면 버틀러마다 맡을 쪽을 고른다. 프리미엄은 신랑측/신부측 필수, 스몰양가는 "양가 통합"이 기본
  const sideOptions = data ? deskSideOptions(data.side, data.plan) : [];
  const side = sideOptions.includes(pickSide as never) ? pickSide : sideOptions[0] === "양가 통합" ? "양가 통합" : "";
  const needSide = sideOptions.length > 0 && !side;
  // 오너 등급은 버틀러 관리의 오너 배분과 같은 규칙: 이 예약 1건 = 1인 기본금 × 2명을 이강 49 : 최소연 51로 나눈다
  const { pool } = ownerPool(assigned.map((a) => ({ rid: reservationId, grade: a.grade, pay: a.pay })));
  const split = splitOwnerPay(pool);
  const ownerShare = (name: string): number | null => (name === "이강" || name === "최소연" ? split[name] : null);
  const amountOf = (a: AssignedView): number => (a.grade === "owner" ? ownerShare(a.name) ?? a.pay : a.pay) + a.extra;
  const total = assigned.filter((a) => a.grade !== "owner").reduce((sum, a) => sum + shiftTotal(a), 0)
    + pool + assigned.filter((a) => a.grade === "owner").reduce((sum, a) => sum + a.extra, 0);

  return (
    <section style={card}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>버틀러 배정</h2>
          <p style={{ margin: 0, fontSize: 12.5, color: "#A79BA1" }}>배정하면 버틀러 관리의 참석·정산 기록에 자동으로 들어갑니다.</p>
        </div>
        {data && (
          <span style={{ padding: "4px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, background: full ? "#E3F1E8" : "#FBEFD9", color: full ? "#2B6A45" : "#8A5A00" }}>
            {assigned.length} / {required}명 {full ? "배정 완료" : "배정 필요"}
          </span>
        )}
      </div>

      {error && <p style={{ margin: 0, color: "#A8416C", fontWeight: 600, fontSize: 13 }}>{error}</p>}
      {!data && !error && <p style={{ margin: 0, color: "#8C8188", fontSize: 13 }}>불러오는 중…</p>}

      {data && (
        <>
          {assigned.length === 0 && <p style={{ margin: "0 0 12px", color: "#8C8188", fontSize: 13 }}>아직 배정된 버틀러가 없습니다.</p>}
          {assigned.map((a) => {
            const mine = notices.filter((m) => m.variables._butlerId === a.butlerId); // 최신 먼저
            const notice = mine.find((m) => m.status === "sent") ?? mine[0];
            const status = noticeStatus(notice, a.hasPhone, data.date);
            const isOpen = openNotice === a.shiftId;
            return (
            <div key={a.shiftId} style={{ padding: "10px 0", borderBottom: "1px solid #F4F1F3" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <b style={{ minWidth: 70, fontSize: 14 }}>{a.name}</b>
              <select style={selectStyle} value={a.grade} disabled={busy || a.paid} aria-label={`${a.name} 등급`}
                onChange={(e) => run(() => updateShiftGrade(a.shiftId, e.target.value), "등급을 바꿨습니다.")}>
                {GRADES.map((g) => <option key={g} value={g}>{BUTLER_GRADES[g].label}</option>)}
              </select>
              {sideOptions.length > 0 ? (
                <select style={selectStyle} value={a.side} disabled={busy || a.paid} aria-label={`${a.name} 담당`}
                  onChange={(e) => run(() => setAssignmentSide(a.shiftId, e.target.value), "담당을 바꿨습니다.")}>
                  {!sideOptions.includes(a.side as never) && <option value={a.side}>{a.side || "담당 선택"}</option>}
                  {sideOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : a.side ? (
                <span style={{ fontSize: 12, fontWeight: 700, color: "#6E646A", background: "#F6F3F5", padding: "3px 9px", borderRadius: 99 }}>{a.side}</span>
              ) : null}
              <span style={{ fontSize: 13, color: "#6E646A", fontVariantNumeric: "tabular-nums" }}>
                {won(amountOf(a))}{a.grade === "owner" && ownerShare(a.name) !== null ? ` (오너 배분 ${OWNER_SPLIT[a.name as keyof typeof OWNER_SPLIT]}%)` : ""}{a.extra ? ` (스페셜 차지 ${won(a.extra)} 포함)` : ""}
              </span>
              {a.paid && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#2B6A45", background: "#E3F1E8", padding: "2px 9px", borderRadius: 99 }}>지급 완료</span>}
              <span style={{ flex: 1 }} />
              <button type="button" disabled={busy || a.paid} onClick={() => { if (window.confirm(`${a.name} 님의 배정을 해제할까요? 정산 기록도 함께 지워집니다.`)) void run(() => unassignButler(a.shiftId), "배정을 해제했습니다."); }}
                style={{ border: 0, background: "transparent", color: "#8C8188", fontSize: 12.5, cursor: a.paid ? "default" : "pointer", opacity: a.paid ? 0.4 : 1 }}>해제</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap", fontSize: 12 }}>
              <span style={{ fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: status.bg, color: status.color }}>알림톡 {status.text}</span>
              {notice && notice.status !== "skipped" && (
                <button type="button" onClick={() => setOpenNotice(isOpen ? "" : a.shiftId)} style={{ border: 0, background: "transparent", color: "#8A3F61", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>{isOpen ? "닫기" : "보낸 내용 보기"}</button>
              )}
            </div>
            {isOpen && notice && (
              <div style={{ marginTop: 8, borderRadius: 12, background: "#FEF9DC", padding: "12px 14px", fontSize: 12.5, lineHeight: 1.75, color: "#3C3A2E", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {notice.text ?? Object.entries(notice.variables).filter(([k]) => !k.startsWith("_")).map(([k, v]) => `${k.replace(/^#\{|\}$/g, "")}: ${v}`).join("\n")}
              </div>
            )}
            </div>
            );
          })}
          {assigned.length > 0 && <div style={{ padding: "10px 0 0", fontSize: 13, color: "#6E646A" }}>정산 예정 합계 <b style={{ color: "#B0567E" }}>{won(total)}</b></div>}
          {pool > 0 && <p style={{ margin: "6px 0 0", fontSize: 12, color: "#A79BA1" }}>오너 버틀러는 버틀러 관리의 오너 배분 규칙대로 이 예약 1건을 {won(pool / OWNER_HEADCOUNT)} × {OWNER_HEADCOUNT}명 = {won(pool)}으로 보고 이강 {OWNER_SPLIT.이강} : 최소연 {OWNER_SPLIT.최소연}로 나눈 금액입니다 (이강 {won(split.이강)} · 최소연 {won(split.최소연)}).</p>}

          {cancelled ? (
            <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "#8C8188" }}>취소된 예약에는 새로 배정할 수 없습니다. 배정되어 있던 버틀러는 위에서 해제해 주세요.</p>
          ) : !data.date ? (
            <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "#8C8188" }}>예식 날짜가 정해지면 배정할 수 있습니다.</p>
          ) : free.length === 0 ? (
            <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "#8C8188" }}>{(data.butlers.length === 0) ? "버틀러 관리에서 버틀러를 먼저 추가해 주세요." : "배정할 수 있는 다른 버틀러가 없습니다."}</p>
          ) : (
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
              <select style={{ ...selectStyle, flex: "1 1 190px" }} value={sel?.id ?? ""} onChange={(e) => { setPick(e.target.value); setPickGrade(""); }} aria-label="배정할 버틀러">
                {free.map((b) => <option key={b.id} value={b.id}>{b.name}{b.busyAt !== null ? ` · 같은 날 다른 예약 배정됨${b.busyAt ? ` (${b.busyAt})` : ""}` : ""}</option>)}
              </select>
              <select style={selectStyle} value={grade} onChange={(e) => setPickGrade(e.target.value)} aria-label="이번 참석 등급">
                {GRADES.map((g) => <option key={g} value={g}>{BUTLER_GRADES[g].label} · {won(BUTLER_GRADES[g].pay)}</option>)}
              </select>
              {sideOptions.length > 0 && (
                <select style={selectStyle} value={side} onChange={(e) => setPickSide(e.target.value)} aria-label="맡을 쪽">
                  {!side && <option value="">담당 선택</option>}
                  {sideOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              <button type="button" disabled={busy || !sel || needSide} title={needSide ? "맡을 쪽(신랑측/신부측)을 골라 주세요" : undefined} onClick={() => sel && run(() => assignButler(reservationId, sel.id, grade, side), `${sel.name} 님을 배정했습니다.`)}
                style={{ height: 38, padding: "0 18px", border: 0, borderRadius: 12, background: "#B0567E", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.7 : 1 }}>배정</button>
            </div>
          )}
          {sel && sel.busyAt !== null && !cancelled && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#A0632E" }}>{sel.name} 님은 같은 날 다른 예약에 이미 배정되어 있습니다. 시간이 겹치지 않는지 확인해 주세요.</p>}
        </>
      )}
    </section>
  );
}
