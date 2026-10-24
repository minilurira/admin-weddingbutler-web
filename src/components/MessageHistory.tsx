"use client";

import { useEffect, useState } from "react";
import { getMessages } from "@/lib/messageActions";
import type { MessageView } from "@/lib/messageView";
import { formatStamp } from "@/lib/format";

const STATUS: Record<string, { text: string; bg: string; color: string }> = {
  sent: { text: "발송 요청 완료", bg: "#E3F1E8", color: "#2B6A45" },
  failed: { text: "발송 실패", bg: "#F7E4E4", color: "#A8416C" },
  skipped: { text: "미발송", bg: "#EEECED", color: "#8A8487" },
};

/** 예약 상세의 "알림톡 발송 내역": 고객·직원에게 간 알림톡/문자를 시간순(최신 먼저)으로 보여 주고, 눌러서 받은 내용을 확인한다. */
export default function MessageHistory({ reservationId, card, legacyLabel }: { reservationId: string; card: React.CSSProperties; legacyLabel: string }) {
  const [rows, setRows] = useState<MessageView[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    getMessages(reservationId).then((r) => { if (!cancelled) { setRows(r); setError(""); } }).catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "발송 내역을 불러오지 못했습니다."); });
    return () => { cancelled = true; };
  }, [reservationId]);

  return (
    <section style={card}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>알림톡 발송 내역</h2>
        <p style={{ margin: 0, fontSize: 12.5, color: "#A79BA1" }}>이 예약으로 고객과 직원에게 나간 알림톡·문자입니다. &quot;내용 보기&quot;로 고객이 받은 메시지를 확인하세요.</p>
      </div>

      {error && <p style={{ margin: 0, color: "#A8416C", fontWeight: 600, fontSize: 13 }}>{error}</p>}
      {!rows && !error && <p style={{ margin: 0, color: "#8C8188", fontSize: 13 }}>불러오는 중…</p>}

      {rows && rows.length === 0 && (
        <p style={{ margin: 0, color: "#8C8188", fontSize: 13, lineHeight: 1.7 }}>
          기록된 발송 내역이 없습니다. 이 기능이 생기기 전에 나간 알림톡은 기록되지 않았습니다.{legacyLabel ? ` (${legacyLabel})` : ""}
        </p>
      )}

      {rows?.map((m) => {
        const st = STATUS[m.status] ?? STATUS.sent;
        const isOpen = open === m.id;
        return (
          <div key={m.id} style={{ borderTop: "1px solid #F4F1F3", padding: "11px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <b style={{ fontSize: 13.5 }}>{m.kind}</b>
              <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: m.channel === "알림톡" ? "#FFF4BF" : "#EDF0F4", color: m.channel === "알림톡" ? "#5A4A00" : "#3E4C5C" }}>{m.channel}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: st.bg, color: st.color }}>{st.text}</span>
              <span style={{ fontSize: 12.5, color: "#8C8188" }}>{formatStamp(new Date(m.createdAt))} · {m.recipient || "-"}</span>
              <span style={{ flex: 1 }} />
              {m.status !== "skipped" && (
                <button type="button" onClick={() => setOpen(isOpen ? "" : m.id)} style={{ border: 0, background: "transparent", color: "#8A3F61", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{isOpen ? "닫기" : "내용 보기"}</button>
              )}
            </div>
            {m.detail && <div style={{ marginTop: 4, fontSize: 12.5, color: m.status === "failed" ? "#A8416C" : "#8C8188" }}>{m.detail}</div>}
            {isOpen && (
              <div style={{ marginTop: 10, borderRadius: 12, background: "#FEF9DC", padding: "14px 16px", fontSize: 13, lineHeight: 1.75, color: "#3C3A2E", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {m.text ?? (
                  <>
                    템플릿 본문을 불러오지 못해, 알림톡에 채워 보낸 값만 보여 드립니다.
                    {"\n\n"}
                    {Object.entries(m.variables).map(([k, v]) => `${k.replace(/^#\{|\}$/g, "")}: ${v}`).join("\n")}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
