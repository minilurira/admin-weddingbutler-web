import { homepageUrl } from "@/lib/records";
import { hasLinkPayments, refundLinkPayments } from "@/lib/paymentLink";

// 결제는 홈페이지(포트원 → KG이니시스)에서 받았으므로, 결제취소도 홈페이지의
// /api/reservations/cancel 에 맡긴다. 포트원 키는 홈페이지에만 있다.
// 키는 예약 연동과 같은 값 (어드민 RESERVATION_API_KEY = 홈페이지 ADMIN_API_KEY).

export type PaymentCancelResult =
  | { state: "cancelled"; refundAmount: number }
  | { state: "no_payment"; message: string }
  | { state: "error"; message: string };

export interface PaymentCancelOptions {
  /** 환불할 금액(원). 결제금액 이상이거나 생략하면 전액 취소, 그보다 적으면 부분취소 */
  amount?: number;
  /** 포트원에 남는 취소 요청자 */
  requester?: "ADMIN" | "CUSTOMER";
}

// 어드민에서 보낸 결제 링크(포트원 V1)로 받은 결제가 있으면 그것부터 환불하고, 모자란 몫만 홈페이지 결제에서 환불한다.
export async function requestPaymentCancel(bookingNo: string, reason: string, opts: PaymentCancelOptions = {}): Promise<PaymentCancelResult> {
  if (!(await hasLinkPayments(bookingNo))) return requestHomepageCancel(bookingNo, reason, opts);

  const link = await refundLinkPayments(bookingNo, opts.amount ?? Number.MAX_SAFE_INTEGER, reason);
  // 일부라도 환불됐으면 되돌릴 수 없으니 취소를 진행하고, 실제 환불 금액만 남긴다
  if (link.error && !link.refunded) return { state: "error", message: `결제 링크 결제취소 실패: ${link.error}` };
  if (link.error) return { state: "cancelled", refundAmount: link.refunded };
  if (opts.amount === undefined || link.remaining <= 0) return { state: "cancelled", refundAmount: link.refunded };

  const rest = await requestHomepageCancel(bookingNo, reason, { ...opts, amount: link.remaining });
  if (rest.state === "cancelled") return { state: "cancelled", refundAmount: link.refunded + rest.refundAmount };
  if (rest.state === "error") console.error(`[paymentCancel] homepage remainder cancel failed for ${bookingNo}: ${rest.message}`);
  return { state: "cancelled", refundAmount: link.refunded };
}

async function requestHomepageCancel(bookingNo: string, reason: string, opts: PaymentCancelOptions): Promise<PaymentCancelResult> {
  const apiKey = process.env.RESERVATION_API_KEY;
  if (!apiKey) return { state: "error", message: "RESERVATION_API_KEY가 설정되지 않아 결제취소를 요청할 수 없습니다." };

  let res: Response;
  try {
    res = await fetch(`${homepageUrl()}/api/reservations/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ bookingNo, reason, amount: opts.amount, requester: opts.requester }),
      cache: "no-store",
    });
  } catch (err) {
    console.error(`[paymentCancel] failed to reach homepage for ${bookingNo}`, err);
    return { state: "error", message: "홈페이지에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  const data = (await res.json().catch(() => ({}))) as { code?: string; message?: string; refundAmount?: number };
  if (data.code === "cancelled" || data.code === "already_cancelled") {
    return { state: "cancelled", refundAmount: data.refundAmount ?? 0 };
  }
  if (data.code === "not_found" || data.code === "not_paid") {
    return { state: "no_payment", message: data.message ?? "결제 완료된 기록이 없습니다." };
  }
  console.error(`[paymentCancel] homepage responded ${res.status} for ${bookingNo}`, data);
  if (res.status === 401) return { state: "error", message: "홈페이지 연동 키가 맞지 않습니다." };
  return { state: "error", message: data.message ?? `결제취소 요청이 실패했습니다 (${res.status}).` };
}
