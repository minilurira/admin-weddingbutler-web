
import { logError } from "@/lib/errorLog";// 포트원 V1 API — 어드민에서 보내는 결제 링크(링크페이)와 그 결제의 조회·취소에만 쓴다.
// 홈페이지 예약 결제는 V2라서 홈페이지(/api/reservations/cancel)가 따로 처리한다.
// 키: 포트원 콘솔 → 결제연동 → 연동 정보 → V1 API (PORTONE_V1_IMP_KEY / PORTONE_V1_IMP_SECRET).

const API = "https://api.iamport.kr";
const LINK_API = "https://api.iamport.co/api/supplements/v1/link/payment";

export class PortOneV1Error extends Error {}

async function accessToken(): Promise<string> {
  const impKey = process.env.PORTONE_V1_IMP_KEY;
  const impSecret = process.env.PORTONE_V1_IMP_SECRET;
  if (!impKey || !impSecret) throw new PortOneV1Error("PORTONE_V1_IMP_KEY / PORTONE_V1_IMP_SECRET이 설정되지 않았습니다.");
  const res = await fetch(`${API}/users/getToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imp_key: impKey, imp_secret: impSecret }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { code?: number; message?: string; response?: { access_token?: string } };
  const token = data.response?.access_token;
  if (!res.ok || !token) throw new PortOneV1Error(`포트원 인증 실패 (${data.message ?? res.status})`);
  return token;
}

/** 응답 모양이 문서와 조금 달라도 결제 URL을 찾을 수 있게, 알려진 키부터 보고 없으면 처음 나오는 http 주소를 쓴다. */
function findUrl(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  for (const key of ["shortenedUrl", "shortened_url", "url", "paymentUrl", "payment_url", "link"]) {
    const v = o[key];
    if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
  }
  for (const v of Object.values(o)) {
    if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
    const nested = typeof v === "object" ? findUrl(v) : null;
    if (nested) return nested;
  }
  return null;
}

export interface CreateLinkInput {
  merchantUid: string;
  name: string;
  amount: number;
  buyerName: string;
  buyerTel: string;
  expiresAt: Date;
}

/** 결제 URL 생성. 결제 결과는 포트원 V1 웹훅으로만 온다(/api/public/portone/webhook). */
export async function createPaymentLink(input: CreateLinkInput): Promise<string> {
  const token = await accessToken();
  const channelKey = process.env.PORTONE_V1_CHANNEL_KEY;
  const paymentInfo = {
    merchant_uid: input.merchantUid,
    name: input.name,
    amount: input.amount,
    buyer_name: input.buyerName,
    buyer_tel: input.buyerTel.replace(/[^0-9]/g, ""),
    pay_method: "card",
  };
  const body: Record<string, unknown> = {
    expired_at: Math.floor(input.expiresAt.getTime() / 1000),
    payment_info: JSON.stringify(paymentInfo),
  };
  // 채널 키를 넣으면 고객이 결제창 선택 없이 바로 이니시스 카드 결제로 간다
  if (channelKey) body.direct = { channelKey, pay_method: "card" };

  const res = await fetch(LINK_API, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8", Authorization: token },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const url = res.ok ? findUrl(data) : null;
  if (!url) {
    logError(`[portoneV1] link create failed for ${input.merchantUid} (${res.status})`, JSON.stringify(data));
    throw new PortOneV1Error(`결제 링크를 만들지 못했습니다 (${String(data.message ?? res.status)}).`);
  }
  return url;
}

/** 결제 URL 비활성화: 결제 URL의 마지막 부분을 링크 API 주소 뒤에 붙여 PUT. 실패해도 예외를 던지지 않는다. */
export async function deactivatePaymentLink(url: string): Promise<boolean> {
  const code = url.replace(/\/+$/, "").split("/").pop();
  if (!code) return false;
  try {
    const token = await accessToken();
    const res = await fetch(`${LINK_API}/${encodeURIComponent(code)}`, {
      method: "PUT",
      headers: { Authorization: token },
      cache: "no-store",
    });
    if (!res.ok) logError(`[portoneV1] link deactivate failed (${res.status})`, await res.text().catch(() => ""));
    return res.ok;
  } catch (err) {
    logError("[portoneV1] link deactivate failed", err);
    return false;
  }
}

export interface V1Payment {
  impUid: string;
  merchantUid: string;
  /** "ready" | "paid" | "cancelled" | "failed" */
  status: string;
  amount: number;
  cancelAmount: number;
  paidAt: Date | null;
}

/** 결제 단건 조회 (웹훅 내용은 그대로 믿지 않고 이걸로 다시 확인한다). 없으면 null. */
export async function getPayment(impUid: string): Promise<V1Payment | null> {
  const token = await accessToken();
  const res = await fetch(`${API}/payments/${encodeURIComponent(impUid)}`, { headers: { Authorization: token }, cache: "no-store" });
  if (res.status === 404) return null;
  const data = (await res.json().catch(() => ({}))) as { message?: string; response?: Record<string, unknown> | null };
  if (!res.ok) throw new PortOneV1Error(`포트원 결제 조회 실패 (${data.message ?? res.status})`);
  const p = data.response;
  if (!p) return null;
  return {
    impUid: String(p.imp_uid ?? impUid),
    merchantUid: String(p.merchant_uid ?? ""),
    status: String(p.status ?? ""),
    amount: Number(p.amount ?? 0),
    cancelAmount: Number(p.cancel_amount ?? 0),
    paidAt: typeof p.paid_at === "number" && p.paid_at > 0 ? new Date(p.paid_at * 1000) : null,
  };
}

export type V1CancelResult = { ok: true; cancelledAmount: number } | { ok: false; message: string };

/** 결제 취소(부분취소 가능). 이미 취소된 결제는 ok로 본다. */
export async function cancelPayment(impUid: string, amount: number, reason: string): Promise<V1CancelResult> {
  let token: string;
  try {
    token = await accessToken();
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "포트원 인증 실패" };
  }
  const res = await fetch(`${API}/payments/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ imp_uid: impUid, amount, reason }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { code?: number; message?: string; response?: { cancel_amount?: number } | null };
  if (res.ok && data.code === 0 && data.response) return { ok: true, cancelledAmount: amount };
  if (/이미.*취소|already/i.test(data.message ?? "")) return { ok: true, cancelledAmount: 0 };
  logError(`[portoneV1] cancel failed for ${impUid} (${res.status})`, JSON.stringify(data));
  return { ok: false, message: data.message ?? `결제취소 실패 (${res.status})` };
}
