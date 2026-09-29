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
      console.error(`[kakaowork] send failed: ${res.status}`, await res.text());
    }
  } catch (err) {
    console.error("[kakaowork] failed to reach API", err);
  }
}
