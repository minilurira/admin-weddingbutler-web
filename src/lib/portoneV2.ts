import { logError } from "@/lib/errorLog";

// 포트원 V2 API — 현금영수증 수동 발급·취소에만 쓴다 (POST /cash-receipts, POST /payments/{paymentId}/cash-receipt/cancel).
// 현금으로 받은 거래라 포트원 결제건이 아니므로, 우리가 정한 paymentId에 현금영수증만 따로 발급한다.
// 키: 포트원 콘솔 → 결제연동 → 연동 정보 → V2 API (PORTONE_V2_API_SECRET), 스토어 ID, 현금영수증을 발급할 수 있는 채널 키.

const API = process.env.PORTONE_API_BASE || "https://api.portone.io";

export class PortOneV2Error extends Error {}

function config() {
  const secret = process.env.PORTONE_V2_API_SECRET;
  const storeId = process.env.PORTONE_V2_STORE_ID;
  const channelKey = process.env.PORTONE_V2_CASH_RECEIPT_CHANNEL_KEY;
  if (!secret || !storeId || !channelKey) {
    throw new PortOneV2Error("PORTONE_V2_API_SECRET / PORTONE_V2_STORE_ID / PORTONE_V2_CASH_RECEIPT_CHANNEL_KEY가 설정되지 않았습니다.");
  }
  return { secret, storeId, channelKey };
}

/** 발급 대상: 소득공제(개인)는 휴대폰 번호 또는 현금영수증 카드, 지출증빙(사업자)은 사업자등록번호 */
export type CashReceiptKind = "PERSONAL" | "CORPORATE";
export type IdentityType = "PHONE" | "CARD" | "BUSINESS";

export interface IssueInput {
  paymentId: string;
  orderName: string;
  amount: number;
  kind: CashReceiptKind;
  identityNumber: string;
  identityType: IdentityType;
  customerName: string;
  paidAt: Date;
}

export interface IssuedReceipt {
  issueNumber: string;
  url: string;
}

async function call(path: string, body: unknown, secret: string): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `PortOne ${secret}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

/** 현금영수증 발급. 실패하면 PortOneV2Error(사유 포함)를 던진다. */
export async function issueCashReceipt(input: IssueInput): Promise<IssuedReceipt> {
  const { secret, storeId, channelKey } = config();
  const { ok, status, data } = await call("/cash-receipts", {
    storeId,
    channelKey,
    paymentId: input.paymentId,
    type: input.kind,
    orderName: input.orderName,
    currency: "KRW",
    amount: { total: input.amount, taxFree: 0 },
    productType: "DIGITAL",
    paidAt: input.paidAt.toISOString(),
    customer: { identityNumber: input.identityNumber, identityNumberType: input.identityType, name: input.customerName },
  }, secret);
  const receipt = (data.cashReceipt ?? {}) as Record<string, unknown>;
  if (!ok || receipt.status === "ISSUE_FAILED") {
    logError(`[portoneV2] cash receipt issue failed for ${input.paymentId} (${status})`, JSON.stringify(data));
    const reason = String(data.message ?? (receipt.pgReason as string | undefined) ?? receipt.status ?? status);
    throw new PortOneV2Error(`현금영수증을 발급하지 못했습니다 (${reason}).`);
  }
  return { issueNumber: String(receipt.issueNumber ?? ""), url: String(receipt.url ?? "") };
}

/** 발급한 현금영수증 취소. 실패하면 PortOneV2Error를 던진다. */
export async function cancelCashReceipt(paymentId: string): Promise<void> {
  const { secret, storeId } = config();
  const { ok, status, data } = await call(`/payments/${encodeURIComponent(paymentId)}/cash-receipt/cancel?storeId=${encodeURIComponent(storeId)}`, {}, secret);
  if (!ok) {
    logError(`[portoneV2] cash receipt cancel failed for ${paymentId} (${status})`, JSON.stringify(data));
    throw new PortOneV2Error(`현금영수증을 취소하지 못했습니다 (${String(data.message ?? status)}).`);
  }
}
