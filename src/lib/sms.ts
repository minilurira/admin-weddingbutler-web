import { SolapiMessageService } from "solapi";

import { logError } from "@/lib/errorLog";
/** 일반 문자(SMS) 발송. 솔라피 설정이 없거나 실패하면 false — 호출부가 고객에게 안내한다. */
export async function sendSms(to: string, text: string, logTag: string): Promise<boolean> {
  return (await sendSmsWithGroup(to, text, logTag)).ok;
}

/** sendSms와 같지만 솔라피 그룹 ID도 돌려준다 — 발송 내역에 남겨 두면 나중에 수신 결과를 확인한다(src/lib/messageResult.ts). */
export async function sendSmsWithGroup(to: string, text: string, logTag: string): Promise<{ ok: boolean; groupId?: string }> {
  const key = process.env.SOLAPI_API_KEY;
  const secret = process.env.SOLAPI_API_SECRET;
  const from = process.env.SOLAPI_SENDER_PHONE;
  if (!key || !secret || !from) {
    console.warn(`[sms] Solapi env vars not fully set — skipping SMS for ${logTag}.`);
    return { ok: false };
  }
  try {
    const result = await new SolapiMessageService(key, secret).send({ to: to.replace(/[^0-9]/g, ""), from, text });
    if (result.failedMessageList.length > 0) {
      logError(`[sms] Solapi rejected SMS for ${logTag}:`, JSON.stringify(result.failedMessageList));
      return { ok: false };
    }
    return { ok: true, groupId: result.groupInfo?.groupId };
  } catch (err) {
    logError(`[sms] Solapi SMS failed for ${logTag}`, err);
    return { ok: false };
  }
}
