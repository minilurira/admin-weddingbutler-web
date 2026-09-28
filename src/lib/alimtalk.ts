import { SolapiMessageService } from "solapi";

function client(): SolapiMessageService | null {
  const key = process.env.SOLAPI_API_KEY;
  const secret = process.env.SOLAPI_API_SECRET;
  if (!key || !secret) return null;
  return new SolapiMessageService(key, secret);
}

function digitsOnly(phone: string) {
  return phone.replace(/[^0-9]/g, "");
}

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
  const svc = client();
  const from = process.env.SOLAPI_SENDER_PHONE;
  const templateId = process.env.SOLAPI_TEMPLATE_CONFIRMED;
  if (!svc || !from || !templateId) {
    console.warn(`[alimtalk] Solapi env vars not fully set — skipping confirm send for ${payload.reservationId}.`);
    return { sent: false, detail: "미설정 (로컬 기록만 저장됨)" };
  }
  try {
    await svc.send({
      to: digitsOnly(payload.phone),
      from,
      kakaoOptions: {
        pfId: process.env.SOLAPI_PF_ID!,
        templateId,
        variables: {
          "#{고객명}": payload.customer,
          "#{예식장}": payload.venue,
          "#{예식일자}": payload.date,
          "#{예식시간}": payload.time,
          "#{금액}": payload.amount.toLocaleString("ko-KR"),
        },
      },
    });
    return { sent: true, detail: "전송 완료" };
  } catch (err) {
    console.error(`[alimtalk] Solapi confirm send failed for ${payload.reservationId}`, err);
    return { sent: false, detail: "전송 실패" };
  }
}

export interface NewReservationAlimtalkPayload {
  reservationId: string;
  customer: string;
  phone: string;
  venue: string;
  date: string;
  time: string;
  amount: number;
}

export async function sendNewReservationAlimtalk(payload: NewReservationAlimtalkPayload): Promise<void> {
  const svc = client();
  const from = process.env.SOLAPI_SENDER_PHONE;
  const pfId = process.env.SOLAPI_PF_ID;
  const customerTemplateId = process.env.SOLAPI_TEMPLATE_NEW_CUSTOMER;
  const staffTemplateId = process.env.SOLAPI_TEMPLATE_NEW_STAFF;
  const staffPhones = (process.env.SOLAPI_STAFF_PHONES ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (!svc || !from || !pfId || !customerTemplateId || !staffTemplateId) {
    console.warn(`[alimtalk] Solapi env vars not fully set — skipping new-reservation send for ${payload.reservationId}.`);
    return;
  }

  const variables = {
    "#{고객명}": payload.customer,
    "#{예식장}": payload.venue,
    "#{예식일자}": payload.date,
    "#{예식시간}": payload.time,
    "#{금액}": payload.amount.toLocaleString("ko-KR"),
  };

  const messages = [
    {
      to: digitsOnly(payload.phone),
      from,
      kakaoOptions: {
        pfId,
        templateId: customerTemplateId,
        variables,
      },
    },
    ...staffPhones.map((phone) => ({
      to: digitsOnly(phone),
      from,
      kakaoOptions: {
        pfId,
        templateId: staffTemplateId,
        variables,
      },
    })),
  ];

  try {
    await svc.send(messages);
  } catch (err) {
    console.error(`[alimtalk] Solapi new-reservation send failed for ${payload.reservationId}`, err);
  }
}
