import type { Reservation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calcConfirm, isPaymentType, onsiteAmount, PAYMENT_TYPES, won } from "@/lib/pricing";
import { sendNewReservationAlimtalk, sendPaymentLinkAlimtalk } from "@/lib/alimtalk";
import { sendSms } from "@/lib/sms";
import { sendNewReservationKakaoWorkNotice } from "@/lib/kakaowork";
import { formatStamp } from "@/lib/format";
import { cancelPayment, createPaymentLink, deactivatePaymentLink, getPayment, PortOneV1Error } from "@/lib/portoneV1";
import { expireLabel, expiryAfterDays, paymentLinkText, paymentLinkVariables, type PaymentLinkFields } from "@/lib/paymentLinkText";

// 어드민 → 고객 결제 링크(포트원 V1 링크페이). 링크 생성·발송, 웹훅 반영, 환불을 여기서 한다.

export const PAYMENT_LINK_MIN_AMOUNT = 1000;
export const PAYMENT_LINK_MAX_DAYS = 14;

export interface SendLinkOptions {
  amount: number;
  paymentType: string;
  days: number;
}

export type SendLinkResult = { ok: true; message: string } | { ok: false; message: string };

/** 예약 1건에 결제 링크를 새로 만들어 알림톡(실패 시 문자)으로 보낸다. 아직 결제 안 된 이전 링크는 비활성화한다. */
export async function sendPaymentLinkFor(r: Reservation, opts: SendLinkOptions): Promise<SendLinkResult> {
  if (r.status === "취소") return { ok: false, message: "취소된 예약에는 결제 링크를 보낼 수 없습니다." };
  const amount = Math.floor(opts.amount);
  if (!(amount >= PAYMENT_LINK_MIN_AMOUNT)) return { ok: false, message: `결제 금액은 ${won(PAYMENT_LINK_MIN_AMOUNT)} 이상이어야 합니다.` };
  const days = Math.min(PAYMENT_LINK_MAX_DAYS, Math.max(1, Math.floor(opts.days) || 3));
  const expiresAt = expiryAfterDays(days);

  const seq = (await prisma.paymentLink.count({ where: { reservationId: r.id } })) + 1;
  const merchantUid = `${r.id}-L${seq}`;
  const plan = r.confirmPlan || r.requestedPlan;

  let url: string;
  try {
    url = await createPaymentLink({
      merchantUid,
      name: `웨딩버틀러 ${plan}`,
      amount,
      buyerName: r.customer,
      buyerTel: r.phone,
      expiresAt,
    });
  } catch (err) {
    if (err instanceof PortOneV1Error) return { ok: false, message: err.message };
    console.error(`[paymentLink] create failed for ${r.id}`, err);
    return { ok: false, message: "포트원에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  const previous = await prisma.paymentLink.findMany({ where: { reservationId: r.id, status: "sent" } });
  for (const p of previous) {
    await deactivatePaymentLink(p.url);
    await prisma.paymentLink.updateMany({ where: { id: p.id, status: "sent" }, data: { status: "cancelled" } });
  }

  const fields: PaymentLinkFields = {
    name: r.customer,
    bookingNo: r.id,
    wishDate: r.wishDateLabel,
    plan,
    amount,
    expiresAt,
    payUrl: url,
  };
  const tag = `payment link ${merchantUid}`;
  let sentVia = "";
  if (await sendPaymentLinkAlimtalk(r.phone, paymentLinkVariables(fields), tag)) sentVia = "alimtalk";
  else if (await sendSms(r.phone, paymentLinkText(fields), tag)) sentVia = "sms";

  await prisma.paymentLink.create({
    data: {
      reservationId: r.id,
      merchantUid,
      amount,
      paymentType: isPaymentType(opts.paymentType) ? opts.paymentType : "",
      url,
      expiresAt,
      sentVia,
    },
  });
  const via = sentVia === "alimtalk" ? "알림톡" : sentVia === "sms" ? "문자" : "발송 실패";
  await prisma.note.create({
    data: { reservationId: r.id, text: `결제 링크 발송 · ${won(amount)} · ${expireLabel(expiresAt)} · ${via}${previous.length ? " · 이전 링크 취소" : ""}` },
  });

  return sentVia
    ? { ok: true, message: `결제 링크(${won(amount)})를 ${via}으로 보냈습니다.` }
    : { ok: true, message: "결제 링크는 만들었지만 고객에게 보내지 못했습니다. 링크를 복사해 직접 보내 주세요." };
}

/** 아직 결제 안 된 링크를 취소(포트원 비활성화). */
export async function cancelPaymentLinkById(linkId: string): Promise<SendLinkResult> {
  const link = await prisma.paymentLink.findUnique({ where: { id: linkId } });
  if (!link || link.status !== "sent") return { ok: false, message: "취소할 수 있는 결제 링크가 아닙니다." };
  const deactivated = await deactivatePaymentLink(link.url);
  const { count } = await prisma.paymentLink.updateMany({ where: { id: link.id, status: "sent" }, data: { status: "cancelled" } });
  if (!count) return { ok: false, message: "이미 결제되었거나 취소된 링크입니다." };
  await prisma.note.create({ data: { reservationId: link.reservationId, text: `결제 링크 취소 · ${won(link.amount)}${deactivated ? "" : " · 포트원 비활성화 실패(만료 시각까지 열려 있을 수 있음)"}` } });
  return { ok: true, message: deactivated ? "결제 링크를 취소했습니다." : "결제 링크를 취소로 표시했습니다. 포트원 쪽 비활성화는 실패해 만료 전까지 열려 있을 수 있어요." };
}

export type WebhookOutcome = "applied" | "duplicate" | "ignored" | "amount_mismatch";

/** 포트원 V1 웹훅 처리. imp_uid로 결제를 다시 조회해 확인한 뒤, 우리 결제 링크 건이고 금액이 맞을 때만 예약에 반영한다. */
export async function applyPaymentWebhook(impUid: string): Promise<WebhookOutcome> {
  const pay = await getPayment(impUid);
  if (!pay || pay.status !== "paid") return "ignored";
  const link = await prisma.paymentLink.findUnique({ where: { merchantUid: pay.merchantUid }, include: { reservation: true } });
  if (!link) return "ignored";
  if (link.impUid) return "duplicate";
  const r = link.reservation;

  if (pay.amount !== link.amount) {
    console.error(`[paymentLink] amount mismatch for ${link.merchantUid}: paid ${pay.amount}, expected ${link.amount}`);
    await prisma.note.create({ data: { reservationId: r.id, text: `결제 링크 금액 불일치 · 청구 ${won(link.amount)} / 결제 ${won(pay.amount)} · 확인 필요 (포트원 ${impUid})` } });
    await sendNewReservationKakaoWorkNotice(`결제 링크 금액 불일치 (${r.id})\n고객: ${r.customer} · ${r.phone}\n청구 ${won(link.amount)} / 결제 ${won(pay.amount)} · 포트원 콘솔에서 확인해 주세요.`);
    return "amount_mismatch";
  }

  // 같은 웹훅이 여러 번 와도 한 번만 반영한다. 취소로 표시한 링크라도 고객이 결제했다면 받는다.
  const { count } = await prisma.paymentLink.updateMany({
    where: { id: link.id, impUid: null },
    data: { status: "paid", impUid, paidAmount: pay.amount, paidAt: pay.paidAt ?? new Date() },
  });
  if (!count) return "duplicate";

  const updated = await prisma.reservation.update({
    where: { id: r.id },
    data: {
      paidAmount: { increment: pay.amount },
      ...(isPaymentType(link.paymentType) ? { paymentType: link.paymentType } : {}),
    },
  });
  await prisma.note.create({ data: { reservationId: r.id, text: `결제 링크로 결제 완료 · ${won(pay.amount)} · ${formatStamp(pay.paidAt ?? new Date())}` } });

  const total = calcConfirm({ plan: updated.confirmPlan, butlers: updated.confirmButlers, extraGuests: updated.confirmExtraGuests, discount: updated.confirmDiscount }).total;
  const onsite = onsiteAmount(total, updated.paidAmount);
  await sendNewReservationAlimtalk({
    reservationId: updated.id,
    customer: updated.customer,
    couple: updated.couple,
    phone: updated.phone,
    wishDateLabel: updated.wishDateLabel,
    venueLabel: updated.venueLabel,
    guestsLabel: updated.guestsLabel,
    requestedPlan: updated.requestedPlan,
    planAmount: total,
    paidAmount: updated.paidAmount,
    confirmAmount: total,
    balanceAmount: onsite,
  });
  await sendNewReservationKakaoWorkNotice(
    [
      `결제 링크 결제 완료 (${updated.id})`,
      `고객: ${updated.customer} (${updated.couple}) · ${updated.phone}`,
      `예식: ${updated.wishDateLabel} · ${updated.venueLabel}`,
      `결제: ${isPaymentType(link.paymentType) ? PAYMENT_TYPES[link.paymentType].name : "유형 미지정"} · 이번 결제 ${won(pay.amount)} · 누적 ${won(updated.paidAmount)} · 현장(현금) ${won(onsite)}`,
    ].join("\n")
  );
  return "applied";
}

export interface LinkRefundResult {
  refunded: number;
  /** 결제 링크로 환불하지 못한 나머지 (홈페이지 결제에서 환불할 몫) */
  remaining: number;
  error?: string;
}

/** 결제 링크로 받은 결제를 최근 것부터 amount만큼 환불한다. 결제 링크 결제가 없으면 아무것도 안 한다. */
export async function refundLinkPayments(reservationId: string, amount: number, reason: string): Promise<LinkRefundResult> {
  const links = await prisma.paymentLink.findMany({ where: { reservationId, status: "paid" }, orderBy: { paidAt: "desc" } });
  let remaining = amount;
  let refunded = 0;
  for (const link of links) {
    const refundable = link.paidAmount - link.refundedAmount;
    if (remaining <= 0 || refundable <= 0 || !link.impUid) continue;
    const take = Math.min(remaining, refundable);
    const result = await cancelPayment(link.impUid, take, reason);
    if (!result.ok) return { refunded, remaining, error: result.message };
    await prisma.paymentLink.update({ where: { id: link.id }, data: { refundedAmount: { increment: take } } });
    refunded += take;
    remaining -= take;
  }
  return { refunded, remaining };
}

export async function hasLinkPayments(reservationId: string) {
  return (await prisma.paymentLink.count({ where: { reservationId, status: "paid" } })) > 0;
}
