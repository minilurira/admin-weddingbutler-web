"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { won } from "@/lib/pricing";
import { useToast } from "./ToastContext";
import { publishRecord, revokeRecord, saveRecord } from "@/lib/recordActions";
import { TEMPLATE_HEADER, readSheet, toGuests } from "@/lib/sheet";

type Side = "신랑측" | "신부측";

interface Row {
  key: number;
  envelopeNo: string;
  side: Side;
  name: string;
  relation: string;
  amount: string;
  tickets: string;
  memo: string;
}

export interface RecordEditorProps {
  reservation: { id: string; customer: string; couple: string; plan: string; dateLabel: string; venue: string; butlers: number };
  link: {
    status: string;
    url: string;
    previewUrl: string | null;
    version: number;
    publishedLabel: string;
    expiresLabel: string;
    lastViewedLabel: string;
  } | null;
  initial: {
    recordMode: "opened" | "sealed";
    handoverAt: string;
    handoverEnvelopeCount: number;
    receiverLabel: string;
    staffCount: number;
    videoUrl: string;
    entries: { envelopeNo: number; side: Side; name: string; relation: string; amount: number | null; tickets: number; memo: string }[];
  };
  retentionDays: number;
}

const RELATIONS = ["친척", "친구", "직장", "지인"];
const STATUS_LABEL: Record<string, { text: string; bg: string; color: string }> = {
  draft: { text: "작성 중", bg: "#F6F3F5", color: "#6E646A" },
  published: { text: "게시됨", bg: "#E6F2EC", color: "#2F6B4F" },
  revoked: { text: "회수됨", bg: "#FBF0DC", color: "#8A5A00" },
};

let rowKey = 0;
const toRow = (e: RecordEditorProps["initial"]["entries"][number]): Row => ({
  key: ++rowKey,
  envelopeNo: String(e.envelopeNo),
  side: e.side,
  name: e.name,
  relation: e.relation,
  amount: e.amount == null ? "" : String(e.amount),
  tickets: String(e.tickets),
  memo: e.memo,
});
const num = (v: string) => Number(String(v).replace(/[^0-9]/g, "")) || 0;

export default function RecordEditor({ reservation, link, initial, retentionDays }: RecordEditorProps) {
  const router = useRouter();
  const showToast = useToast();
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState(initial.recordMode);
  const [meta, setMeta] = useState({
    handoverAt: initial.handoverAt,
    handoverEnvelopeCount: String(initial.handoverEnvelopeCount || ""),
    receiverLabel: initial.receiverLabel,
    staffCount: String(initial.staffCount),
    videoUrl: initial.videoUrl,
  });
  const [rows, setRows] = useState<Row[]>(() => initial.entries.map(toRow));
  const [dirty, setDirty] = useState(false);

  const sealed = mode === "sealed";
  const status = STATUS_LABEL[link?.status ?? "draft"] ?? STATUS_LABEL.draft;
  const isPublished = link?.status === "published";

  const summary = useMemo(() => {
    const filled = rows.filter((r) => r.name.trim());
    const nos = filled.map((r) => num(r.envelopeNo));
    const dupes = nos.filter((n, i) => n && nos.indexOf(n) !== i);
    return {
      envelopes: filled.length,
      tickets: filled.reduce((a, r) => a + num(r.tickets), 0),
      amount: filled.reduce((a, r) => a + num(r.amount), 0),
      missingNo: filled.filter((r) => !num(r.envelopeNo)).length,
      dupes: Array.from(new Set(dupes)),
    };
  }, [rows]);
  const handoverCount = num(meta.handoverEnvelopeCount);
  const countMismatch = handoverCount > 0 && handoverCount !== summary.envelopes;

  function touch() {
    setDirty(true);
  }

  function setMetaField(key: keyof typeof meta) {
    return {
      value: meta[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => { setMeta((m) => ({ ...m, [key]: e.target.value })); touch(); },
    };
  }

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    touch();
  }

  function addRow() {
    const next = rows.reduce((m, r) => Math.max(m, num(r.envelopeNo)), 0) + 1;
    setRows((rs) => [...rs, { key: ++rowKey, envelopeNo: String(next), side: rs.at(-1)?.side ?? "신랑측", name: "", relation: "", amount: "", tickets: "1", memo: "" }]);
    touch();
  }

  function removeRow(key: number) {
    setRows((rs) => rs.filter((r) => r.key !== key));
    touch();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const guests = toGuests(await readSheet(file));
      if (guests.length === 0) { showToast("명단에서 이름이 있는 줄을 찾지 못했어요."); return; }
      if (rows.some((r) => r.name.trim()) && !window.confirm(`지금 표의 명단을 지우고 파일의 ${guests.length}명으로 바꿀까요?`)) return;
      setRows(guests.map(toRow));
      touch();
      showToast(`${guests.length}명을 불러왔어요. 확인한 뒤 저장해 주세요.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "파일을 읽지 못했어요.");
    }
  }

  function downloadTemplate() {
    const csv = "﻿" + TEMPLATE_HEADER.join(",") + "\r\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "축의기록_명단양식.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function onSave(after?: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const res = await saveRecord(reservation.id, {
        recordMode: mode,
        handoverAt: meta.handoverAt,
        handoverEnvelopeCount: num(meta.handoverEnvelopeCount),
        receiverLabel: meta.receiverLabel,
        staffCount: num(meta.staffCount),
        videoUrl: meta.videoUrl,
        entries: rows.map((r) => ({
          envelopeNo: num(r.envelopeNo),
          side: r.side,
          name: r.name,
          relation: r.relation,
          amount: r.amount.trim() ? num(r.amount) : null,
          tickets: num(r.tickets),
          memo: r.memo,
        })),
      });
      if (!res.ok) { showToast(res.message); return; }
      setDirty(false);
      const final = after ? await after() : res;
      showToast(final.message);
      router.refresh();
    });
  }

  function onPublish() {
    onSave(() => publishRecord(reservation.id));
  }

  function onRevoke() {
    if (!window.confirm("링크를 회수하면 고객에게 보낸 주소가 바로 막혀요. 회수할까요?")) return;
    startTransition(async () => {
      const res = await revokeRecord(reservation.id);
      showToast(res.message);
      router.refresh();
    });
  }

  async function copyUrl() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      showToast("고객용 주소를 복사했어요.");
    } catch {
      window.prompt("주소를 복사해 주세요.", link.url);
    }
  }

  const inputStyle: React.CSSProperties = { border: 0, background: "#F6F3F5", borderRadius: 12, padding: "12px 14px", fontSize: 13.5, color: "#1E1A1C", width: "100%", boxSizing: "border-box" };
  const cellInput: React.CSSProperties = { ...inputStyle, padding: "9px 10px", borderRadius: 10, background: "#FFFFFF", border: "1px solid #ECE7E9" };
  const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#6E646A" };
  const ghostBtn: React.CSSProperties = { height: 40, padding: "0 16px", border: "1px solid #E4DCE1", borderRadius: 12, background: "#FFFFFF", color: "#413A3E", fontSize: 13, fontWeight: 700, cursor: "pointer" };
  const primaryBtn: React.CSSProperties = { height: 48, padding: "0 22px", border: 0, borderRadius: 14, background: "#B0567E", color: "#fff", fontSize: 14.5, fontWeight: 700, opacity: isPending ? 0.7 : 1, cursor: "pointer" };
  const th: React.CSSProperties = { textAlign: "left", fontSize: 12, fontWeight: 700, color: "#8C8188", padding: "0 6px 8px", whiteSpace: "nowrap" };

  return (
    <main style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: "6px 28px 60px" }}>
      <div style={{ marginBottom: 6 }}>
        <Link href={`/reservations?id=${reservation.id}`} style={{ fontSize: 13, fontWeight: 600, color: "#8C8188" }}>← 예약 상세로</Link>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.6px", wordBreak: "keep-all" }}>{reservation.customer} 님 · 축의 기록</h1>
        <span style={{ padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: status.bg, color: status.color }}>{status.text}</span>
      </div>
      <div style={{ fontSize: 13, color: "#8C8188", marginBottom: 22 }}>
        {reservation.id} · {reservation.couple} · {reservation.plan} · {reservation.dateLabel} · {reservation.venue}
      </div>

      <section style={{ background: "#F8F6F7", borderRadius: 18, padding: 22, marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>고객용 링크</h2>
        {!link && <p style={{ margin: 0, fontSize: 13, color: "#8C8188" }}>명단을 저장하면 링크가 만들어지고, 게시하면 고객이 열 수 있어요. 게시일로부터 {retentionDays}일 동안 열람할 수 있어요.</p>}
        {link && (
          <>
            <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#8C8188" }}>
              {isPublished
                ? `고객은 예약 전화번호로 문자 인증을 한 뒤 볼 수 있어요.${link.expiresLabel ? ` ${link.expiresLabel}까지 열려요.` : ""}`
                : link.status === "revoked"
                  ? "회수된 링크예요. 다시 게시하면 새 주소가 만들어져요."
                  : "아직 게시 전이라 고객은 열 수 없어요. 아래 \"고객 화면으로 보기\"로 미리 확인할 수 있어요."}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <code style={{ flex: "1 1 260px", minWidth: 0, padding: "11px 14px", borderRadius: 12, background: "#FFFFFF", fontSize: 13, color: isPublished ? "#1E1A1C" : "#A79BA1", overflowWrap: "anywhere" }}>{link.url}</code>
              {isPublished && <button type="button" onClick={copyUrl} style={ghostBtn}>주소 복사</button>}
              {link.previewUrl && <a href={link.previewUrl} target="_blank" rel="noopener noreferrer" style={{ ...ghostBtn, display: "inline-flex", alignItems: "center" }}>고객 화면으로 보기</a>}
            </div>
            {isPublished && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", marginTop: 12, fontSize: 12.5, color: "#6E646A" }}>
                <span>게시 {link.publishedLabel}</span>
                <span>버전 {link.version}</span>
                <span>{link.lastViewedLabel ? `고객 마지막 열람 ${link.lastViewedLabel}` : "고객이 아직 열어 보지 않았어요"}</span>
              </div>
            )}
          </>
        )}
      </section>

      <section style={{ background: "#FFFFFF", border: "1px solid #EFEBED", borderRadius: 18, padding: 22, marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 800 }}>기본 정보</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {(["opened", "sealed"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); touch(); }}
              aria-pressed={mode === m}
              style={{ height: 40, padding: "0 16px", borderRadius: 12, fontSize: 13.5, fontWeight: 700, cursor: "pointer", border: mode === m ? "1px solid #B0567E" : "1px solid #E4DCE1", background: mode === m ? "#F9EFF4" : "#FFFFFF", color: mode === m ? "#8A3F61" : "#6E646A" }}
            >
              {m === "opened" ? "개봉 집계 (금액 기록)" : "밀봉 접수 (금액 없음)"}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <label style={labelStyle}>인계 시각<input type="datetime-local" {...setMetaField("handoverAt")} style={inputStyle} /></label>
          <label style={labelStyle}>인계확인서 봉투 매수<input inputMode="numeric" {...setMetaField("handoverEnvelopeCount")} placeholder="0" style={inputStyle} /></label>
          <label style={labelStyle}>축의금 인수자 (고객 화면 표시)<input {...setMetaField("receiverLabel")} placeholder="김○○ (신랑 부친)" style={inputStyle} /></label>
          <label style={labelStyle}>담당 버틀러 (명)<input inputMode="numeric" {...setMetaField("staffCount")} style={inputStyle} /></label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>운영 영상 링크 (선택)<input {...setMetaField("videoUrl")} placeholder="https://" style={inputStyle} /></label>
        </div>
      </section>

      <section style={{ background: "#FFFFFF", border: "1px solid #EFEBED", borderRadius: 18, padding: 22, marginBottom: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, marginRight: "auto" }}>하객 명단</h2>
          <button type="button" onClick={downloadTemplate} style={ghostBtn}>양식 내려받기</button>
          <button type="button" onClick={() => fileRef.current?.click()} style={ghostBtn}>엑셀·CSV 불러오기</button>
          <input ref={fileRef} type="file" accept=".xlsx,.csv" onChange={onFile} style={{ display: "none" }} />
        </div>
        <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "#8C8188" }}>
          파일을 불러오거나 표에 직접 입력하세요. 머리글(봉투번호·구분·이름·관계·금액·식권·메모)이 있으면 열 순서는 달라도 돼요.
        </p>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: sealed ? 720 : 820, borderCollapse: "separate", borderSpacing: "0 6px" }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 76 }}>봉투번호</th>
                <th style={{ ...th, width: 104 }}>구분</th>
                <th style={th}>이름</th>
                <th style={{ ...th, width: 110 }}>관계</th>
                {!sealed && <th style={{ ...th, width: 120 }}>금액 (원)</th>}
                <th style={{ ...th, width: 64 }}>식권</th>
                <th style={th}>메모</th>
                <th style={{ ...th, width: 44 }} aria-label="삭제" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: "0 3px" }}><input inputMode="numeric" value={r.envelopeNo} onChange={(e) => updateRow(r.key, { envelopeNo: e.target.value })} style={cellInput} aria-label="봉투번호" /></td>
                  <td style={{ padding: "0 3px" }}>
                    <select value={r.side} onChange={(e) => updateRow(r.key, { side: e.target.value as Side })} style={cellInput} aria-label="구분">
                      <option value="신랑측">신랑측</option>
                      <option value="신부측">신부측</option>
                    </select>
                  </td>
                  <td style={{ padding: "0 3px" }}><input value={r.name} onChange={(e) => updateRow(r.key, { name: e.target.value })} style={cellInput} aria-label="이름" /></td>
                  <td style={{ padding: "0 3px" }}><input list="wb-relations" value={r.relation} onChange={(e) => updateRow(r.key, { relation: e.target.value })} style={cellInput} aria-label="관계" /></td>
                  {!sealed && <td style={{ padding: "0 3px" }}><input inputMode="numeric" value={r.amount} onChange={(e) => updateRow(r.key, { amount: e.target.value })} style={cellInput} aria-label="금액" /></td>}
                  <td style={{ padding: "0 3px" }}><input inputMode="numeric" value={r.tickets} onChange={(e) => updateRow(r.key, { tickets: e.target.value })} style={cellInput} aria-label="식권" /></td>
                  <td style={{ padding: "0 3px" }}><input value={r.memo} onChange={(e) => updateRow(r.key, { memo: e.target.value })} style={cellInput} aria-label="메모" /></td>
                  <td style={{ padding: "0 3px", textAlign: "center" }}>
                    <button type="button" onClick={() => removeRow(r.key)} aria-label={`${r.name || "빈"} 줄 삭제`} style={{ width: 36, height: 36, border: 0, borderRadius: 10, background: "#F6F3F5", color: "#8C8188", fontSize: 16, cursor: "pointer" }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="wb-relations">{RELATIONS.map((r) => <option key={r} value={r} />)}</datalist>
        </div>

        <button type="button" onClick={addRow} style={{ ...ghostBtn, marginTop: 8 }}>+ 줄 추가</button>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", marginTop: 16, fontSize: 13.5, color: "#413A3E", fontWeight: 600 }}>
          <span>봉투 {summary.envelopes}장</span>
          <span>식권 {summary.tickets}장</span>
          {!sealed && <span>합계 {won(summary.amount)}</span>}
        </div>
        {(countMismatch || summary.missingNo > 0 || summary.dupes.length > 0) && (
          <ul style={{ margin: "10px 0 0", padding: "12px 14px 12px 30px", borderRadius: 12, background: "#FBF0DC", color: "#8A5A00", fontSize: 13, lineHeight: 1.7 }}>
            {countMismatch && <li>인계확인서 매수({handoverCount}장)와 명단 봉투 수({summary.envelopes}장)가 달라요. 고객 화면에 문의 안내가 표시돼요.</li>}
            {summary.missingNo > 0 && <li>봉투번호가 비어 있는 줄이 {summary.missingNo}개 있어요.</li>}
            {summary.dupes.length > 0 && <li>봉투번호 {summary.dupes.join(", ")}번이 겹쳐요.</li>}
          </ul>
        )}
      </section>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button type="button" disabled={isPending} onClick={() => onSave()} style={{ ...primaryBtn, background: "#FFFFFF", color: "#8A3F61", border: "1px solid #D9A3BC" }}>
          저장
        </button>
        <button type="button" disabled={isPending} onClick={onPublish} style={primaryBtn}>
          {isPublished ? "저장하고 고객 화면에 반영" : "저장하고 게시하기"}
        </button>
        {link && link.status === "published" && (
          <button type="button" disabled={isPending} onClick={onRevoke} style={{ ...ghostBtn, height: 48, marginLeft: "auto", color: "#A8416C" }}>링크 회수</button>
        )}
        {dirty && <span style={{ fontSize: 12.5, color: "#A79BA1" }}>저장하지 않은 변경이 있어요</span>}
      </div>
    </main>
  );
}
