"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/errorActions";

// 화면을 그리다가 오류가 났을 때의 안내. 오류는 "오류 기록"에 남긴다.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void reportClientError(error.message || "화면 오류", window.location.pathname).catch(() => undefined);
  }, [error]);
  return (
    <main style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <div style={{ maxWidth: 380 }}>
        <h1 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 800 }}>문제가 생겼어요</h1>
        <p style={{ margin: "0 0 20px", fontSize: 14.5, lineHeight: 1.8, color: "#6E646A" }}>화면을 불러오지 못했어요. 다시 시도해 주세요. 계속되면 사이드바의 "오류 기록"에서 원인을 확인할 수 있어요.</p>
        <button type="button" onClick={reset} style={{ height: 46, padding: "0 28px", border: 0, borderRadius: 12, background: "#B0567E", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>다시 시도</button>
      </div>
    </main>
  );
}
