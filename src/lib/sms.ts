import { SolapiMessageService } from "solapi";

/** 일반 문자(SMS) 발송. 솔라피 설정이 없거나 실패하면 false — 호출부가 고객에게 안내한다. */
export async function sendSms(to: string, text: string, logTag: string): Promise<boolean> {
  const key = process.env.SOLAPI_API_KEY;
  const secret = process.env.SOLAPI_API_SECRET;
  const from = process.env.SOLAPI_SENDER_PHONE;
  if (!key || !secret || !from) {
    console.warn(`[sms] Solapi env vars not fully set — skipping SMS for ${logTag}.`);
    return false;
  }
  try {
    const result = await new SolapiMessageService(key, secret).send({ to: to.replace(/[^0-9]/g, ""), from, text });
    if (result.failedMessageList.length > 0) {
      console.error(`[sms] Solapi rejected SMS for ${logTag}:`, JSON.stringify(result.failedMessageList));
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[sms] Solapi SMS failed for ${logTag}`, err);
    return false;
  }
}
