
import { logError } from "@/lib/errorLog";

export async function sendNewReservationKakaoWorkNotice(text: string): Promise<void> {
  const appKey = process.env.KAKAOWORK_APP_KEY;
  const conversationId = process.env.KAKAOWORK_CONVERSATION_ID;
  if (!appKey || !conversationId) {
    console.warn("[kakaowork] KAKAOWORK_APP_KEY/KAKAOWORK_CONVERSATION_ID not set — skipping staff notice.");
    return;
  }
  try {
    const res = await fetch("https://api.kakaowork.com/v1/messages.send", {
      method: "POST",
      headers: { Authorization: `Bearer ${appKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId, text }),
    });
    if (!res.ok) {
      logError(`[kakaowork] send failed: ${res.status}`, await res.text());
    }
  } catch (err) {
    logError("[kakaowork] failed to reach API", err);
  }
}

/** 버틀러 배정 완료 알림방 (오너 버틀러 방, 2026-11-14 봇이 conversations.open으로 만든 방). 봇은 신규 예약 알림과 같은 봇. */
const ASSIGN_CONVERSATION_ID = process.env.KAKAOWORK_ASSIGN_CONVERSATION_ID || "1041686349241855";

/** 버틀러 배정 완료 알림방에 보낸다. 실패해도 배정은 유지되고, 결과만 돌려준다. */
export async function sendAssignKakaoWorkNotice(text: string): Promise<boolean> {
  const appKey = process.env.KAKAOWORK_APP_KEY;
  if (!appKey) {
    console.warn("[kakaowork] KAKAOWORK_APP_KEY not set — skipping assign notice.");
    return false;
  }
  try {
    const res = await fetch("https://api.kakaowork.com/v1/messages.send", {
      method: "POST",
      headers: { Authorization: `Bearer ${appKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: ASSIGN_CONVERSATION_ID, text }),
    });
    if (!res.ok) {
      logError(`[kakaowork] assign notice failed: ${res.status}`, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    logError("[kakaowork] failed to reach API (assign notice)", err);
    return false;
  }
}
