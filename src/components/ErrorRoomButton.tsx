"use client";

import { useState, useTransition } from "react";
import { createErrorRoomAction } from "@/lib/errorActions";

export default function ErrorRoomButton({ hasRoom }: { hasRoom: boolean }) {
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(hasRoom);
  const [pending, start] = useTransition();
  return (
    <div style={{ margin: "0 0 16px", fontSize: 13.5, lineHeight: 1.7 }}>
      {done ? (
        <span style={{ color: "#2E7D5B", fontWeight: 600 }}>오류 알림방이 연결돼 있습니다. 서버 오류가 생기면 카카오워크로 알려드립니다.{msg && ` ${msg}`}</span>
      ) : (
        <>
          <button type="button" disabled={pending} style={{ height: 38, padding: "0 16px", borderRadius: 10, border: 0, background: "#B0567E", color: "#fff", fontWeight: 700, cursor: "pointer" }}
            onClick={() => { if (window.confirm("카카오워크에 새 오류 알림방을 만들고 이강·최소연을 초대할까요?")) start(async () => { const r = await createErrorRoomAction(); setMsg(r.message); if (r.ok) setDone(true); }); }}>
            {pending ? "만드는 중…" : "오류 알림방 만들기"}
          </button>
          <span style={{ marginLeft: 10, color: msg ? "#A8416C" : "#8C8188" }}>{msg || "아직 알림방이 없어 오류 알림이 가지 않습니다."}</span>
        </>
      )}
    </div>
  );
}
