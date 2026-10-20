"use client";

import { useMemo, useState, useTransition } from "react";
import type { Inquiry } from "@/lib/inquiries";
import { saveInquiryMemo, setInquiriesHandled } from "@/lib/inquiryActions";
import { formatStamp } from "@/lib/format";
import { useToast } from "./ToastContext";

const FILTERS = ["전체", "미처리", "처리완료"] as const;
type Filter = (typeof FILTERS)[number];
const PAGE_SIZE = 20;

const ICON = { width: 14, height: 14, viewBox: "0 0 20 20", fill: "none", "aria-hidden": true } as const;

function PhoneIcon() {
  return (
    <svg {...ICON}>
      <path d="M5.2 2.8h2.4l1.2 3.6-1.7 1.1a9.5 9.5 0 0 0 5.4 5.4l1.1-1.7 3.6 1.2v2.4a1.8 1.8 0 0 1-1.9 1.8A14.6 14.6 0 0 1 3.4 4.7a1.8 1.8 0 0 1 1.8-1.9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg {...ICON}>
      <rect x="3" y="4.2" width="14" height="12.8" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 8h14M7 2.6v3M13 2.6v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg {...ICON}>
      <path d="M10 17.4s5.6-5.2 5.6-9.4a5.6 5.6 0 1 0-11.2 0c0 4.2 5.6 9.4 5.6 9.4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="10" cy="8" r="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg {...ICON}>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6v4.2l2.8 1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function MemoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m12.6 3.6 3.8 3.8-8.6 8.6H4v-3.8l8.6-8.6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="m6.8 10.2 2.2 2.2 4.2-4.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M7.4 5.4 4 8.8l3.4 3.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.4 8.8h7.4a4.2 4.2 0 0 1 0 8.4H9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function StatusBadge({ handled }: { handled: boolean }) {
  return (
    <span
      style={{
        flex: "0 0 auto", padding: "3px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap",
        background: handled ? "#E3F1E8" : "#FFF0F5", color: handled ? "#2B6A45" : "#A8416C",
      }}
    >
      {handled ? "처리완료" : "미처리"}
    </span>
  );
}

function MemoEditor({ id, memo }: { id: string; memo: string }) {
  const showToast = useToast();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(memo);
  const dirty = draft.trim() !== memo;

  const save = () =>
    startTransition(async () => {
      try {
        await saveInquiryMemo(id, draft);
        showToast("메모를 저장했습니다.");
      } catch {
        showToast("메모를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="상담 메모 (어드민에서만 보입니다)"
        rows={3}
        style={{
          width: "100%", boxSizing: "border-box", resize: "vertical", padding: "10px 12px", borderRadius: 10,
          border: "1px solid #E8E2E5", fontSize: 13, fontFamily: "inherit", color: "#413A3E", background: "#FFFFFF",
        }}
      />
      <button
        type="button"
        onClick={save}
        disabled={isPending || !dirty}
        style={{
          alignSelf: "flex-end", height: 32, padding: "0 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, border: "none",
          background: dirty ? "#B0567E" : "#F4F3F3", color: dirty ? "#FFFFFF" : "#A79BA1", cursor: isPending || !dirty ? "default" : "pointer",
        }}
      >
        메모 저장
      </button>
    </div>
  );
}

export default function InquiryTable({ items }: { items: Inquiry[] }) {
  const showToast = useToast();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("전체");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/[^0-9]/g, "");
    return items.filter((it) => {
      const matchesFilter = filter === "전체" || (filter === "처리완료" ? Boolean(it.handled_at) : !it.handled_at);
      const matchesQuery =
        !q ||
        `${it.name} ${it.message} ${it.area ?? ""} ${it.topic} ${it.admin_memo ?? ""}`.toLowerCase().includes(q) ||
        (qDigits.length >= 3 && it.phone.replace(/[^0-9]/g, "").includes(qDigits));
      return matchesFilter && matchesQuery;
    });
  }, [items, filter, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const rows = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const openCount = items.filter((it) => !it.handled_at).length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const markHandled = (ids: string[], handled: boolean, clearSelection = false) =>
    startTransition(async () => {
      try {
        await setInquiriesHandled(ids, handled);
        showToast(ids.length > 1 ? `${ids.length}건을 ${handled ? "처리완료로 표시" : "미처리로 되돌림"}했습니다.` : handled ? "처리완료로 표시했습니다." : "미처리로 되돌렸습니다.");
        if (clearSelection) setSelected(new Set());
      } catch {
        showToast("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    });

  const pillBtn = (active: boolean): React.CSSProperties => ({
    height: 36, padding: "0 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
    background: active ? "#B0567E" : "#FFFFFF", color: active ? "#FFFFFF" : "#6E646A",
    boxShadow: active ? "none" : "inset 0 0 0 1px #E8E2E5",
  });
  const textBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 2px", border: "none", background: "transparent",
    fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
      <h1 style={{ margin: "10px 0 0", fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px" }}>
        문의 목록 <span style={{ fontSize: 14, color: "#B0567E" }}>미처리 {openCount}건</span>
      </h1>

      {/* 도구줄: 검색 · 필터 · 선택 건수 · 일괄 처리 */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <label style={{ flex: "1 1 220px", display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 14px", borderRadius: 12, background: "#FFFFFF", boxShadow: "inset 0 0 0 1px #E8E2E5" }}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="9" cy="9" r="6" stroke="#A79BA1" strokeWidth="1.8" />
            <path d="m13.5 13.5 3.5 3.5" stroke="#A79BA1" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(0); }}
            placeholder="이름 · 연락처 · 내용 검색"
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 13.5, fontFamily: "inherit", color: "#413A3E" }}
          />
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          {FILTERS.map((f) => (
            <button key={f} type="button" onClick={() => { setFilter(f); setPage(0); }} style={pillBtn(f === filter)}>{f}</button>
          ))}
        </div>
      </div>
      {selected.size > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#B0567E" }}>{selected.size}건 선택됨</span>
          <button type="button" disabled={isPending} onClick={() => markHandled(Array.from(selected), true, true)} style={{ ...pillBtn(false), background: "#4F9A72", color: "#FFFFFF", boxShadow: "none" }}>처리완료</button>
          <button type="button" disabled={isPending} onClick={() => markHandled(Array.from(selected), false, true)} style={pillBtn(false)}>미처리로</button>
          <button type="button" onClick={() => setSelected(new Set())} style={{ ...pillBtn(false), boxShadow: "none", background: "transparent" }}>선택 해제</button>
        </div>
      )}

      {filtered.length === 0 && <div style={{ fontSize: 13.5, color: "#8C8188", padding: "24px 4px" }}>조건에 맞는 문의가 없습니다.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((it) => {
          const handled = Boolean(it.handled_at);
          const open = openId === it.id;
          const toggleOpen = () => setOpenId(open ? null : it.id);
          return (
            <article
              key={it.id}
              style={{
                display: "flex", flexDirection: "column", gap: 10, padding: "16px 18px", borderRadius: 14, background: "#FFFFFF",
                boxShadow: `0 1px 2px rgba(60,30,45,0.05), inset 0 0 0 1px ${open ? "#C98AA6" : "#EEE8EB"}`,
              }}
            >
              {/* 제목 줄 */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  checked={selected.has(it.id)}
                  onChange={() => toggle(it.id)}
                  aria-label={`${it.name} 선택`}
                  style={{ width: 16, height: 16, margin: 0, flex: "0 0 auto", accentColor: "#B0567E", cursor: "pointer" }}
                />
                <button type="button" onClick={toggleOpen} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 8, border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "#2B2126", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name} 님</span>
                  <span style={{ flex: "0 0 auto", fontSize: 12.5, fontWeight: 600, color: "#8C8188" }}>{it.topic}</span>
                </button>
                <StatusBadge handled={handled} />
              </div>

              {/* 내용 미리보기 / 전문 */}
              <button
                type="button"
                onClick={toggleOpen}
                style={{
                  border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                  fontSize: 13.5, color: "#5E555A", lineHeight: 1.6, wordBreak: "break-word", whiteSpace: open ? "pre-wrap" : "normal",
                  ...(open ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }),
                }}
              >
                {it.message}
              </button>

              {/* 정보 줄 */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", fontSize: 12.5, color: "#8C8188" }}>
                <a href={`tel:${it.phone.replace(/[^0-9+]/g, "")}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#B0567E", fontWeight: 600 }}>
                  <PhoneIcon />{it.phone}
                </a>
                {it.ceremony_date && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><CalendarIcon />예식일 {it.ceremony_date}</span>}
                {it.area && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><PinIcon />{it.area}</span>}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><ClockIcon />접수 {formatStamp(new Date(it.created_at))}</span>
              </div>

              {open && (
                <div style={{ paddingTop: 10, borderTop: "1px solid #F3EEF1" }}>
                  <MemoEditor key={it.admin_memo ?? ""} id={it.id} memo={it.admin_memo ?? ""} />
                </div>
              )}

              {/* 동작 줄 */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 18px", paddingTop: 2 }}>
                <button type="button" onClick={toggleOpen} style={{ ...textBtn, color: "#413A3E" }}>
                  <MemoIcon />{open ? "접기" : it.admin_memo ? "메모 보기" : "메모"}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => markHandled([it.id], !handled)}
                  style={{ ...textBtn, color: handled ? "#8A8487" : "#4F9A72" }}
                >
                  {handled ? <UndoIcon /> : <CheckIcon />}
                  {handled ? "되돌리기" : "처리완료"}
                </button>
                {it.handled_at && (
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "#A79BA1" }}>처리 {formatStamp(new Date(it.handled_at))}</span>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* 페이지 */}
      {filtered.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, fontSize: 13, color: "#8C8188" }}>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {current * PAGE_SIZE + 1}–{Math.min(filtered.length, (current + 1) * PAGE_SIZE)} / 전체 {filtered.length}건
          </span>
          <button type="button" aria-label="이전 페이지" disabled={current === 0} onClick={() => setPage(current - 1)} style={{ ...pillBtn(false), width: 36, padding: 0, opacity: current === 0 ? 0.4 : 1 }}>‹</button>
          <button type="button" aria-label="다음 페이지" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)} style={{ ...pillBtn(false), width: 36, padding: 0, opacity: current >= pageCount - 1 ? 0.4 : 1 }}>›</button>
        </div>
      )}
    </div>
  );
}
