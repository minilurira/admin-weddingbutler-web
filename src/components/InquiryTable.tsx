"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import type { Inquiry } from "@/lib/inquiries";
import { setInquiriesHandled } from "@/lib/inquiryActions";
import { formatStamp } from "@/lib/format";
import { useIsMobile } from "@/lib/useIsMobile";
import { useToast } from "./ToastContext";
import InquiryControls from "./InquiryControls";

const FILTERS = ["전체", "미처리", "처리완료"] as const;
type Filter = (typeof FILTERS)[number];
const PAGE_SIZE = 20;

const COLS = "36px 28px minmax(90px,1.1fr) 92px 104px minmax(70px,0.8fr) 128px 92px 96px 104px";

function StatusBadge({ handled }: { handled: boolean }) {
  return (
    <span
      style={{
        display: "inline-block", padding: "4px 10px", borderRadius: 8, fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap",
        background: handled ? "#E3F1E8" : "#FFF0F5", color: handled ? "#2B6A45" : "#A8416C",
      }}
    >
      {handled ? "처리완료" : "미처리"}
    </span>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      style={{ width: 17, height: 17, margin: 0, accentColor: "#B0567E", cursor: "pointer" }}
    />
  );
}

function Detail({ it }: { it: Inquiry }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 32px" }}>
      <div style={{ flex: "2 1 280px", minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#413A3E", marginBottom: 6 }}>문의 내용</div>
        <p style={{ margin: 0, fontSize: 13.5, color: "#413A3E", lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{it.message}</p>
      </div>
      <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#413A3E" }}>
          상담 메모
          {it.handled_at && (
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: "#4F9A72" }}>처리완료 {formatStamp(new Date(it.handled_at))}</span>
          )}
        </div>
        <InquiryControls id={it.id} handled={Boolean(it.handled_at)} memo={it.admin_memo ?? ""} />
      </div>
    </div>
  );
}

export default function InquiryTable({ items }: { items: Inquiry[] }) {
  const mobile = useIsMobile();
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
  const allOnPage = rows.length > 0 && rows.every((it) => selected.has(it.id));
  const openCount = items.filter((it) => !it.handled_at).length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      rows.forEach((it) => (allOnPage ? next.delete(it.id) : next.add(it.id)));
      return next;
    });

  const bulkHandle = (handled: boolean) =>
    startTransition(async () => {
      try {
        await setInquiriesHandled(Array.from(selected), handled);
        showToast(`${selected.size}건을 ${handled ? "처리완료로 표시" : "미처리로 되돌림"}했습니다.`);
        setSelected(new Set());
      } catch {
        showToast("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    });

  const rowHandle = (id: string, handled: boolean) =>
    startTransition(async () => {
      try {
        await setInquiriesHandled([id], handled);
        showToast(handled ? "처리완료로 표시했습니다." : "미처리로 되돌렸습니다.");
      } catch {
        showToast("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    });

  const pillBtn = (active: boolean): React.CSSProperties => ({
    height: 36, padding: "0 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
    background: active ? "#B0567E" : "#FFFFFF", color: active ? "#FFFFFF" : "#6E646A",
    boxShadow: active ? "none" : "inset 0 0 0 1px #E8E2E5",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h1 style={{ margin: "10px 0 0", fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px" }}>
        문의 목록 <span style={{ fontSize: 14, color: "#B0567E" }}>미처리 {openCount}건</span>
      </h1>

      {/* 도구줄: 검색 · 필터 · 선택 건수 · 일괄 처리 */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <label style={{ flex: "1 1 220px", maxWidth: 380, display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 14px", borderRadius: 12, background: "#FFFFFF", boxShadow: "inset 0 0 0 1px #E8E2E5" }}>
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
        {selected.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: mobile ? 0 : "auto" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#B0567E" }}>{selected.size}건 선택됨</span>
            <button type="button" disabled={isPending} onClick={() => bulkHandle(true)} style={{ ...pillBtn(false), background: "#4F9A72", color: "#FFFFFF", boxShadow: "none" }}>처리완료</button>
            <button type="button" disabled={isPending} onClick={() => bulkHandle(false)} style={pillBtn(false)}>미처리로</button>
            <button type="button" onClick={() => setSelected(new Set())} style={{ ...pillBtn(false), boxShadow: "none", background: "transparent" }}>선택 해제</button>
          </div>
        )}
      </div>

      {filtered.length === 0 && <div style={{ fontSize: 13.5, color: "#8C8188", padding: "24px 4px" }}>조건에 맞는 문의가 없습니다.</div>}

      {/* 좁은 화면: 카드 */}
      {mobile && rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((it) => {
            const handled = Boolean(it.handled_at);
            const open = openId === it.id;
            return (
              <article
                key={it.id}
                style={{
                  display: "flex", flexDirection: "column", gap: 10, padding: "14px 16px", borderRadius: 16, background: "#FFFFFF",
                  boxShadow: `inset 0 0 0 ${open ? 1.5 : 1}px ${open ? "#C98AA6" : "#EEE8EB"}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Check checked={selected.has(it.id)} onChange={() => toggle(it.id)} label={`${it.name} 선택`} />
                  <button type="button" onClick={() => setOpenId(open ? null : it.id)} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: "#2B2126" }}>{it.name} 님</span>
                    <span style={{ fontSize: 12, color: "#8C8188" }}>{it.topic}</span>
                    <span style={{ marginLeft: "auto" }}><StatusBadge handled={handled} /></span>
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 12.5, color: "#8C8188" }}>
                  <a href={`tel:${it.phone.replace(/[^0-9+]/g, "")}`} style={{ color: "#B0567E", fontWeight: 600 }}>{it.phone}</a>
                  <span>접수 {formatStamp(new Date(it.created_at))}</span>
                  {it.ceremony_date && <span>예식일 {it.ceremony_date}</span>}
                  {it.area && <span>지역 {it.area}</span>}
                </div>
                {open ? (
                  <Detail it={it} />
                ) : (
                  <button type="button" onClick={() => setOpenId(it.id)} style={{ border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: "#6E646A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {it.message}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* 넓은 화면: 펼침형 표 */}
      {!mobile && rows.length > 0 && (
        <div style={{ borderRadius: 16, background: "#FFFFFF", boxShadow: "inset 0 0 0 1px #EEE8EB", overflowX: "auto" }}>
          <div style={{ minWidth: 980 }}>
          <div role="row" style={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center", gap: 10, padding: "14px 18px", fontSize: 12.5, fontWeight: 800, color: "#413A3E", borderBottom: "1px solid #F1ECEE" }}>
            <Check checked={allOnPage} onChange={togglePage} label="이 페이지 전체 선택" />
            <span />
            <span>이름</span>
            <span>문의 유형</span>
            <span>예식일</span>
            <span>지역</span>
            <span>연락처</span>
            <span>접수</span>
            <span style={{ textAlign: "center" }}>상태</span>
            <span style={{ textAlign: "center" }}>처리</span>
          </div>
          {rows.map((it) => {
            const handled = Boolean(it.handled_at);
            const open = openId === it.id;
            const isSel = selected.has(it.id);
            return (
              <Fragment key={it.id}>
                <div
                  role="row"
                  onClick={() => setOpenId(open ? null : it.id)}
                  style={{
                    display: "grid", gridTemplateColumns: COLS, alignItems: "center", gap: 10, padding: "13px 18px", cursor: "pointer",
                    fontSize: 13.5, color: open ? "#2B2126" : "#6E646A",
                    background: isSel ? "#FBF3F7" : "#FFFFFF",
                    borderTop: open ? "1.5px solid #C98AA6" : "none",
                    borderLeft: open ? "1.5px solid #C98AA6" : "1.5px solid transparent",
                    borderRight: open ? "1.5px solid #C98AA6" : "1.5px solid transparent",
                    borderBottom: open ? "none" : "1px solid #F6F2F4",
                  }}
                >
                  <Check checked={isSel} onChange={() => toggle(it.id)} label={`${it.name} 선택`} />
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
                    <path d="m5 8 5 5 5-5" stroke="#8C8188" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={{ fontWeight: 700, color: "#2B2126", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                  <span style={{ whiteSpace: "nowrap" }}>{it.topic}</span>
                  <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{it.ceremony_date || "-"}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.area || "-"}</span>
                  <a href={`tel:${it.phone.replace(/[^0-9+]/g, "")}`} onClick={(e) => e.stopPropagation()} style={{ color: "#B0567E", fontWeight: 600, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{it.phone}</a>
                  <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{formatStamp(new Date(it.created_at))}</span>
                  <span style={{ textAlign: "center" }}><StatusBadge handled={handled} /></span>
                  <span style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={(e) => { e.stopPropagation(); rowHandle(it.id, !handled); }}
                      style={{
                        height: 30, padding: "0 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", whiteSpace: "nowrap",
                        background: handled ? "#F4F3F3" : "#F9EFF4", color: handled ? "#8A8487" : "#B0567E",
                      }}
                    >
                      {handled ? "되돌리기" : "처리완료"}
                    </button>
                  </span>
                </div>
                {open && (
                  <div style={{ padding: "8px 24px 20px 92px", borderLeft: "1.5px solid #C98AA6", borderRight: "1.5px solid #C98AA6", borderBottom: "1.5px solid #C98AA6", background: "#FFFFFF" }}>
                    <Detail it={it} />
                  </div>
                )}
              </Fragment>
            );
          })}
          </div>
        </div>
      )}

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
