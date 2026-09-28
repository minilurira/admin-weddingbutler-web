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

export interface AlimtalkFields {
  reservationId: string;
  customer: string;
  couple: string;
  phone: string;
  wishDateLabel: string;
  venueLabel: string;
  guestsLabel: string;
  requestedPlan: string;
  planAmount: number;
  paidAmount: number;
  confirmAmount: number;
  balanceAmount: number;
}

function buildVariables(f: AlimtalkFields): Record<string, string> {
  return {
    "#{customer}": f.customer,
    "#{couple}": f.couple,
    "#{phone}": f.phone,
    "#{wishDateLabel}": f.wishDateLabel,
    "#{venueLabel}": f.venueLabel,
    "#{guestLabel}": f.guestsLabel,
    "#{requestedPlan}": f.requestedPlan,
    "#{planAmount}": f.planAmount.toLocaleString("ko-KR"),
    "#{paidAmount}": f.paidAmount.toLocaleString("ko-KR"),
    "#{confirmAmount}": f.confirmAmount.toLocaleString("ko-KR"),
    "#{balanceAmount}": f.balanceAmount.toLocaleString("ko-KR"),
  };
}

export async function sendConfirmAlimtalk(payload: AlimtalkFields): Promise<{ sent: boolean; detail: string }> {
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
        variables: buildVariables(payload),
      },
    });
    return { sent: true, detail: "전송 완료" };
  } catch (err) {
    console.error(`[alimtalk] Solapi confirm send failed for ${payload.reservationId}`, err);
    return { sent: false, detail: "전송 실패" };
  }
}

export async function sendNewReservationAlimtalk(payload: AlimtalkFields): Promise<void> {
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

  const variables = buildVariables(payload);

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
