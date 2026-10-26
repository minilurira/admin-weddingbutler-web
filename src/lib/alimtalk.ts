import { SolapiMessageService } from "solapi";
import { maskPhone, recordMessage, type MessageKind } from "@/lib/messageLog";

function logSendResult(reservationId: string, result: { failedMessageList: readonly unknown[]; groupInfo: { count: Record<string, number> } }) {
  if (result.failedMessageList.length > 0) {
    console.error(`[alimtalk] Solapi rejected send for ${reservationId}:`, JSON.stringify(result.failedMessageList));
  } else {
    console.log(`[alimtalk] Solapi accepted send for ${reservationId}:`, JSON.stringify(result.groupInfo.count));
  }
}

/** 솔라피 결과에서 이 번호로 간 메시지가 거절됐는지 (거절됐으면 사유) */
function failureFor(result: { failedMessageList: readonly { to?: string; statusMessage?: string; statusCode?: string }[] }, phone: string): string | null {
  const f = result.failedMessageList.find((x) => x.to === digitsOnly(phone)) ?? (result.failedMessageList.length === 1 ? result.failedMessageList[0] : undefined);
  return f ? (f.statusMessage || f.statusCode || "전송 실패") : null;
}

/** 예약 상세의 발송 내역용 기록. 저장에 실패해도 발송에는 영향이 없다. */
async function logKakao(reservationId: string, kind: MessageKind, phone: string, templateId: string | undefined, variables: Record<string, string>, outcome: { status: "sent" | "failed" | "skipped"; detail?: string }, staff = false) {
  await recordMessage({ reservationId, kind, channel: "알림톡", recipient: staff ? maskPhone(phone) : phone, templateId, variables, status: outcome.status, detail: outcome.detail });
}

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

/** 신규예약 고객 알림톡의 "결제금액" 값. 템플릿을 다시 검수받지 않으려고 기존 #{paidAmount} 값 뒤에
 * 결제 유형을 붙인다 — 전액결제면 "(전액결제)", 아니면 현장결제 금액.
 * 이 값은 템플릿의 아이템 항목이라 카카오가 23자를 넘으면 거절한다(3076). 넘으면 금액만 보낸다. */
export function paidAmountWithOnsite(paidAmount: number, balanceAmount: number): string {
  const paid = `${paidAmount.toLocaleString("ko-KR")}원`;
  const text = balanceAmount > 0 ? `${paid} (현장 ${balanceAmount.toLocaleString("ko-KR")}원)` : `${paid} (전액결제)`;
  return text.length <= 23 ? text : paid;
}

/** 예약 확정 알림톡의 "현장결제금액"(#{balanceAmount}) 값 — 전액결제면 하객 수 초과 시 변동 안내, 아니면 현금 결제 안내. */
export function onsiteAmountText(balanceAmount: number): string {
  return balanceAmount > 0
    ? `${balanceAmount.toLocaleString("ko-KR")}원 (현금)`
    : "0원 (하객 수 초과 시 변동)";
}

export async function sendConfirmAlimtalk(payload: AlimtalkFields): Promise<{ sent: boolean; detail: string }> {
  const svc = client();
  const from = process.env.SOLAPI_SENDER_PHONE;
  const templateId = process.env.SOLAPI_TEMPLATE_CONFIRMED;
  if (!svc || !from || !templateId) {
    console.warn(`[alimtalk] Solapi env vars not fully set — skipping confirm send for ${payload.reservationId}.`);
    await logKakao(payload.reservationId, "예약 확정", payload.phone, templateId, {}, { status: "skipped", detail: "솔라피 설정이 없어 보내지 않았습니다." });
    return { sent: false, detail: "미설정 (로컬 기록만 저장됨)" };
  }
  const variables = {
    ...buildVariables(payload),
    "#{paidAmount}": `${payload.paidAmount.toLocaleString("ko-KR")}원`,
    "#{balanceAmount}": onsiteAmountText(payload.balanceAmount),
  };
  try {
    const result = await svc.send({
      to: digitsOnly(payload.phone),
      from,
      kakaoOptions: { pfId: process.env.SOLAPI_PF_ID!, templateId, variables },
    });
    logSendResult(payload.reservationId, result);
    const reason = failureFor(result, payload.phone);
    await logKakao(payload.reservationId, "예약 확정", payload.phone, templateId, variables, reason ? { status: "failed", detail: reason } : { status: "sent" });
    if (result.failedMessageList.length > 0) {
      return { sent: false, detail: "전송 실패" };
    }
    return { sent: true, detail: "전송 완료" };
  } catch (err) {
    console.error(`[alimtalk] Solapi confirm send failed for ${payload.reservationId}`, err);
    await logKakao(payload.reservationId, "예약 확정", payload.phone, templateId, variables, { status: "failed", detail: err instanceof Error ? err.message : "전송 실패" });
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

  if (!svc || !from || !pfId || !customerTemplateId) {
    console.warn(`[alimtalk] Solapi env vars not fully set — skipping new-reservation send for ${payload.reservationId}.`);
    await logKakao(payload.reservationId, "신규 예약 접수", payload.phone, customerTemplateId, {}, { status: "skipped", detail: "솔라피 설정이 없어 보내지 않았습니다." });
    return;
  }

  const variables = buildVariables(payload);
  const customerVariables: Record<string, string> = {
    ...variables,
    "#{planAmount}": `${payload.planAmount.toLocaleString("ko-KR")}원`,
    "#{paidAmount}": paidAmountWithOnsite(payload.paidAmount, payload.balanceAmount),
  };

  const messages = [
    {
      to: digitsOnly(payload.phone),
      from,
      kakaoOptions: {
        pfId,
        templateId: customerTemplateId,
        variables: customerVariables,
      },
    },
  ];

  if (staffTemplateId && staffPhones.length > 0) {
    messages.push(
      ...staffPhones.map((phone) => ({
        to: digitsOnly(phone),
        from,
        kakaoOptions: {
          pfId,
          templateId: staffTemplateId,
          variables,
        },
      }))
    );
  } else {
    console.warn(`[alimtalk] SOLAPI_TEMPLATE_NEW_STAFF/SOLAPI_STAFF_PHONES not set — staff Kakao notice skipped for ${payload.reservationId} (Slack 연동 예정).`);
  }

  const logAll = async (outcome: (phone: string) => { status: "sent" | "failed"; detail?: string }) => {
    await logKakao(payload.reservationId, "신규 예약 접수", payload.phone, customerTemplateId, customerVariables, outcome(payload.phone));
    if (staffTemplateId) for (const phone of staffPhones) await logKakao(payload.reservationId, "직원 알림", phone, staffTemplateId, variables, outcome(phone), true);
  };
  try {
    const result = await svc.send(messages);
    logSendResult(payload.reservationId, result);
    await logAll((phone) => { const r = failureFor(result, phone); return r ? { status: "failed", detail: r } : { status: "sent" }; });
  } catch (err) {
    console.error(`[alimtalk] Solapi new-reservation send failed for ${payload.reservationId}`, err);
    await logAll(() => ({ status: "failed", detail: err instanceof Error ? err.message : "전송 실패" }));
  }
}

export type ReminderKind = "7d" | "day";

/** 예식 7일 전 / 당일 리마인더 알림톡. 변수는 확정 알림톡과 같은 값을 보낸다. */
export async function sendReminderAlimtalk(kind: ReminderKind, payload: AlimtalkFields): Promise<{ sent: boolean; detail: string }> {
  const svc = client();
  const from = process.env.SOLAPI_SENDER_PHONE;
  const pfId = process.env.SOLAPI_PF_ID;
  const templateId = kind === "7d" ? process.env.SOLAPI_TEMPLATE_REMIND_7D : process.env.SOLAPI_TEMPLATE_REMIND_DAY;
  if (!svc || !from || !pfId || !templateId) {
    console.warn(`[alimtalk] Solapi env vars not fully set — skipping ${kind} reminder for ${payload.reservationId}.`);
    await logKakao(payload.reservationId, kind === "7d" ? "7일 전 안내" : "당일 안내", payload.phone, templateId, {}, { status: "skipped", detail: "솔라피 설정이 없어 보내지 않았습니다." });
    return { sent: false, detail: "미설정" };
  }
  const reminderKind: MessageKind = kind === "7d" ? "7일 전 안내" : "당일 안내";
  const variables = {
    ...buildVariables(payload),
    "#{paidAmount}": `${payload.paidAmount.toLocaleString("ko-KR")}원`,
    "#{balanceAmount}": onsiteAmountText(payload.balanceAmount),
    // 당일 안내의 축의 기록 링크(report.weddingbutler.co.kr/#{recordCode}). 코드는 예약번호라 기록을 언제 만들어도 같은 주소가 열린다.
    ...(kind === "day" ? { "#{recordCode}": payload.reservationId } : {}),
  };
  try {
    const result = await svc.send({ to: digitsOnly(payload.phone), from, kakaoOptions: { pfId, templateId, variables } });
    logSendResult(payload.reservationId, result);
    const reason = failureFor(result, payload.phone);
    await logKakao(payload.reservationId, reminderKind, payload.phone, templateId, variables, reason ? { status: "failed", detail: reason } : { status: "sent" });
    if (result.failedMessageList.length > 0) return { sent: false, detail: "전송 실패" };
    return { sent: true, detail: "전송 완료" };
  } catch (err) {
    console.error(`[alimtalk] Solapi ${kind} reminder failed for ${payload.reservationId}`, err);
    await logKakao(payload.reservationId, reminderKind, payload.phone, templateId, variables, { status: "failed", detail: err instanceof Error ? err.message : "전송 실패" });
    return { sent: false, detail: "전송 실패" };
  }
}

/** 예약 취소 알림톡. #{refundAmount}에는 실제 환불(결제취소)한 금액, #{cancelReason}에는 취소 사유를 보낸다. */
export async function sendCancelAlimtalk(
  payload: AlimtalkFields & { refundAmount: number; cancelReason: string }
): Promise<{ sent: boolean; detail: string }> {
  const svc = client();
  const from = process.env.SOLAPI_SENDER_PHONE;
  const pfId = process.env.SOLAPI_PF_ID;
  const templateId = process.env.SOLAPI_TEMPLATE_CANCELLED;
  if (!svc || !from || !pfId || !templateId) {
    console.warn(`[alimtalk] Solapi env vars not fully set — skipping cancel send for ${payload.reservationId}.`);
    await logKakao(payload.reservationId, "예약 취소", payload.phone, templateId, {}, { status: "skipped", detail: "솔라피 설정이 없어 보내지 않았습니다." });
    return { sent: false, detail: "미설정" };
  }
  // 카카오 아이템 리스트 값은 23자까지라(초과 시 3076 오류) 표에 들어갈 수 있는 값은 잘라 보낸다.
  const variables: Record<string, string> = Object.fromEntries(
    Object.entries({
      ...buildVariables(payload),
      "#{planAmount}": `${payload.planAmount.toLocaleString("ko-KR")}원`,
      "#{paidAmount}": `${payload.paidAmount.toLocaleString("ko-KR")}원`,
      "#{refundAmount}": `${payload.refundAmount.toLocaleString("ko-KR")}원`,
      "#{cancelReason}": payload.cancelReason,
    }).map(([k, v]) => [k, Array.from(v).length > 23 ? `${Array.from(v).slice(0, 22).join("")}…` : v])
  );
  try {
    const result = await svc.send({ to: digitsOnly(payload.phone), from, kakaoOptions: { pfId, templateId, variables } });
    logSendResult(payload.reservationId, result);
    const reason = failureFor(result, payload.phone);
    await logKakao(payload.reservationId, "예약 취소", payload.phone, templateId, variables, reason ? { status: "failed", detail: reason } : { status: "sent" });
    if (result.failedMessageList.length > 0) return { sent: false, detail: "전송 실패" };
    return { sent: true, detail: "전송 완료" };
  } catch (err) {
    console.error(`[alimtalk] Solapi cancel send failed for ${payload.reservationId}`, err);
    await logKakao(payload.reservationId, "예약 취소", payload.phone, templateId, variables, { status: "failed", detail: err instanceof Error ? err.message : "전송 실패" });
    return { sent: false, detail: "전송 실패" };
  }
}

/** 예약 조회 인증번호 알림톡(#{authCode}). 템플릿 ID가 없거나 실패하면 false — 호출부가 문자로 대신 보낸다. */
export async function sendLookupOtpAlimtalk(phone: string, code: string): Promise<boolean> {
  const svc = client();
  const from = process.env.SOLAPI_SENDER_PHONE;
  const pfId = process.env.SOLAPI_PF_ID;
  const templateId = process.env.SOLAPI_TEMPLATE_LOOKUP_OTP;
  const tag = `lookup ${phone.slice(-4)}`;
  if (!svc || !from || !pfId || !templateId) return false;
  try {
    const result = await svc.send({
      to: digitsOnly(phone),
      from,
      kakaoOptions: { pfId, templateId, disableSms: true, variables: { "#{authCode}": code } },
    });
    logSendResult(tag, result);
    return result.failedMessageList.length === 0;
  } catch (err) {
    console.error(`[alimtalk] Solapi lookup OTP send failed for ${tag}`, err);
    return false;
  }
}

/** 모바일 청첩장 인증번호 알림톡(#{authCode}). 템플릿(SOLAPI_TEMPLATE_INVITATION_OTP)이 없거나 실패하면 false — 호출부가 문자로 보낸다. */
export async function sendInvitationOtpAlimtalk(phone: string, code: string): Promise<boolean> {
  const svc = client();
  const from = process.env.SOLAPI_SENDER_PHONE;
  const pfId = process.env.SOLAPI_PF_ID;
  const templateId = process.env.SOLAPI_TEMPLATE_INVITATION_OTP;
  const tag = `invitation ${phone.slice(-4)}`;
  if (!svc || !from || !pfId || !templateId) return false;
  try {
    const result = await svc.send({
      to: digitsOnly(phone),
      from,
      kakaoOptions: { pfId, templateId, disableSms: true, variables: { "#{authCode}": code } },
    });
    logSendResult(tag, result);
    return result.failedMessageList.length === 0;
  } catch (err) {
    console.error(`[alimtalk] Solapi invitation OTP send failed for ${tag}`, err);
    return false;
  }
}

/** 문의 답변 알림톡(#{name}, #{topic}, #{answer}). 답변은 템플릿 본문에 들어가서 아이템 리스트 23자 제한은 없다.
 * 템플릿 ID가 없거나 바로 거절되면 false — 호출부가 문자(LMS)로 대신 보낸다. 카카오톡 미사용 등으로
 * 나중에 실패하는 건은 솔라피가 템플릿 본문으로 문자 대체발송한다. */
export async function sendInquiryReplyAlimtalk(phone: string, fields: { name: string; topic: string; answer: string }): Promise<boolean> {
  const svc = client();
  const from = process.env.SOLAPI_SENDER_PHONE;
  const pfId = process.env.SOLAPI_PF_ID;
  const templateId = process.env.SOLAPI_TEMPLATE_INQUIRY_REPLY;
  const tag = `inquiry reply ${phone.slice(-4)}`;
  if (!svc || !from || !pfId || !templateId) {
    console.warn(`[alimtalk] SOLAPI_TEMPLATE_INQUIRY_REPLY not fully set — ${tag} goes by SMS.`);
    return false;
  }
  try {
    const result = await svc.send({
      to: digitsOnly(phone),
      from,
      kakaoOptions: {
        pfId,
        templateId,
        variables: { "#{name}": fields.name, "#{topic}": fields.topic, "#{answer}": fields.answer },
      },
    });
    logSendResult(tag, result);
    return result.failedMessageList.length === 0;
  } catch (err) {
    console.error(`[alimtalk] Solapi inquiry reply send failed for ${tag}`, err);
    return false;
  }
}

/** 결제 링크 알림톡(SOLAPI_TEMPLATE_PAYMENT_LINK). 변수와 본문은 src/lib/paymentLinkText.ts.
 * 템플릿 ID가 없거나 바로 거절되면 false — 호출부가 문자(LMS)로 대신 보낸다. */
export async function sendPaymentLinkAlimtalk(phone: string, variables: Record<string, string>, tag: string): Promise<boolean> {
  const svc = client();
  const from = process.env.SOLAPI_SENDER_PHONE;
  const pfId = process.env.SOLAPI_PF_ID;
  const templateId = process.env.SOLAPI_TEMPLATE_PAYMENT_LINK;
  if (!svc || !from || !pfId || !templateId) {
    console.warn(`[alimtalk] SOLAPI_TEMPLATE_PAYMENT_LINK not fully set — ${tag} goes by SMS.`);
    return false;
  }
  try {
    const result = await svc.send({ to: digitsOnly(phone), from, kakaoOptions: { pfId, templateId, variables } });
    logSendResult(tag, result);
    return result.failedMessageList.length === 0;
  } catch (err) {
    console.error(`[alimtalk] Solapi payment link send failed for ${tag}`, err);
    return false;
  }
}
