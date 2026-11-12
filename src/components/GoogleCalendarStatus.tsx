"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncGoogleCalendarNow } from "@/lib/actions";

interface Props {
  missing: string[];
  pending: number;
  registered: number;
}

/** 캘린더 화면 위 구글 캘린더 연결 상태 한 줄 + [지금 다시 등록] */
export default function GoogleCalendarStatus({ missing, pending, registered }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [, start] = useTransition();

  function run() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    start(async () => {
      try {
        setResult(await syncGoogleCalendarNow());
        router.refresh();
      } catch (err) {
        setResult({ ok: false, message: `오류: ${err instanceof Error ? err.message : String(err)}` });
      } finally {
        setBusy(false);
      }
    });
  }

  const configured = missing.length === 0;
  const summary = configured
    ? `연결됨 · 등록 ${registered}건 · 등록 대기 ${pending}건`
    : `설정 없음 · 빠진 환경변수: ${missing.join(", ")}`;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 16, padding: "12px 16px", borderRadius: 14, background: configured ? "#F6F3F5" : "#FDF0F0", fontSize: 13.5, color: "#5E5459" }}>
      <strong style={{ color: "#2B2126" }}>구글 캘린더</strong>
      <span>{summary}</span>
      <button
        onClick={run}
        disabled={busy}
        style={{ marginLeft: "auto", height: 32, padding: "0 12px", border: "1px solid #E8E2E5", background: "#FFFFFF", borderRadius: 10, color: "#6E646A", fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
      >
        {busy ? "등록 중…" : "지금 다시 등록"}
      </button>
      {result && (
        <div style={{ flexBasis: "100%", color: result.ok ? "#3D7A55" : "#B23B3B", wordBreak: "break-all" }}>{result.message}</div>
      )}
    </div>
  );
}
