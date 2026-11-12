"use client";

import { useState, useTransition } from "react";
import { syncGoogleCalendar } from "@/lib/actions";
import { useToast } from "@/components/ToastContext";

/** 예식이 지나지 않은 기존 확정 예약을 구글 캘린더에 한 번에 넣는 버튼 (이미 들어간 예약은 건너뜀) */
export default function GoogleCalendarSyncButton() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();

  function run() {
    if (busy) return;
    setBusy(true);
    start(async () => {
      try {
        const r = await syncGoogleCalendar();
        toast(r.message);
      } catch {
        toast("구글 캘린더 등록 중 오류가 났습니다.");
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <button
      onClick={run}
      disabled={busy}
      style={{ marginLeft: "auto", height: 36, padding: "0 14px", border: "1px solid #E8E2E5", background: "#FFFFFF", borderRadius: 12, color: "#6E646A", fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
    >
      {busy ? "등록 중…" : "구글 캘린더에 확정 예약 넣기"}
    </button>
  );
}
