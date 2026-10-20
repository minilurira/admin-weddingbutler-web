"use client";

import { useState, useTransition } from "react";
import { saveInquiryMemo, setInquiryHandled } from "@/lib/inquiryActions";
import { useToast } from "./ToastContext";

export default function InquiryControls({ id, handled, memo }: { id: string; handled: boolean; memo: string }) {
  const showToast = useToast();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(memo);
  const dirty = draft.trim() !== memo;

  const toggleHandled = () =>
    startTransition(async () => {
      try {
        await setInquiryHandled(id, !handled);
        showToast(handled ? "미처리로 되돌렸습니다." : "처리완료로 표시했습니다.");
      } catch {
        showToast("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    });

  const saveMemo = () =>
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
        rows={2}
        style={{
          width: "100%", boxSizing: "border-box", resize: "vertical", padding: "10px 12px", borderRadius: 10,
          border: "1px solid #E8E2E5", fontSize: 13, fontFamily: "inherit", color: "#413A3E", background: "#FFFFFF",
        }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={saveMemo}
          disabled={isPending || !dirty}
          style={{
            height: 34, padding: "0 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, border: "none",
            background: dirty ? "#F9EFF4" : "#F4F3F3", color: dirty ? "#B0567E" : "#A79BA1",
            cursor: isPending || !dirty ? "default" : "pointer",
          }}
        >
          메모 저장
        </button>
        <button
          type="button"
          onClick={toggleHandled}
          disabled={isPending}
          style={{
            height: 34, padding: "0 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, border: "none",
            background: handled ? "#FFFFFF" : "#4F9A72", color: handled ? "#6E646A" : "#FFFFFF",
            boxShadow: handled ? "inset 0 0 0 1px #E8E2E5" : "none", cursor: isPending ? "default" : "pointer",
          }}
        >
          {handled ? "미처리로 되돌리기" : "처리완료"}
        </button>
      </div>
    </div>
  );
}
