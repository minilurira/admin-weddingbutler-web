export interface AlimtalkPayload {
  reservationId: string;
  customer: string;
  phone: string;
  venue: string;
  date: string;
  time: string;
  amount: number;
}

export async function sendConfirmAlimtalk(payload: AlimtalkPayload): Promise<{ sent: boolean; detail: string }> {
  const url = process.env.N8N_ALIMTALK_WEBHOOK_URL;
  if (!url) {
    console.warn(
      `[alimtalk] N8N_ALIMTALK_WEBHOOK_URL is not set — skipping real send for ${payload.reservationId}. ` +
        `Set the env var to an n8n webhook URL to enable real KakaoTalk sending.`
    );
    return { sent: false, detail: "웹훅 미설정 (로컬 기록만 저장됨)" };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[alimtalk] n8n webhook responded ${res.status} for ${payload.reservationId}`);
      return { sent: false, detail: `전송 실패 (${res.status})` };
    }
    return { sent: true, detail: "전송 완료" };
  } catch (err) {
    console.error(`[alimtalk] failed to reach n8n webhook for ${payload.reservationId}`, err);
    return { sent: false, detail: "전송 실패 (네트워크 오류)" };
  }
}
