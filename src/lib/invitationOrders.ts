import { homepageUrl } from "@/lib/records";

// 모바일 청첩장 프리미엄 결제내역. 결제 기록은 홈페이지 DB에 있어서 홈페이지 API(/api/admin/invitation-orders)로 읽고 취소한다.

export interface InvitationOrder {
  paymentId: string;
  invitationId: string | null;
  amount: number;
  status: "pending" | "paid" | "failed" | "cancelled" | string;
  template: string;
  phone: string;
  groom: string;
  bride: string;
  slug: string;
  url: string;
  createdAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelledAmount: number | null;
  cancelReason: string;
  invitationStatus: string | null;
  invitationTemplate: string | null;
}

export const TEMPLATE_NAME: Record<string, string> = { classic: "클래식 아이보리", modern: "모던 미니멀", botanical: "보태니컬 그린", rose: "로즈 에디토리얼" };

export type OrdersResult = { ok: true; orders: InvitationOrder[] } | { ok: false; message: string };

function key() {
  return process.env.RESERVATION_API_KEY || "";
}

async function call(path: string, init: RequestInit): Promise<{ status: number; data: Record<string, unknown> } | { error: string }> {
  const apiKey = key();
  if (!apiKey) return { error: "RESERVATION_API_KEY가 설정되지 않아 홈페이지에 연결할 수 없습니다." };
  try {
    const res = await fetch(`${homepageUrl()}${path}`, { ...init, headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, cache: "no-store" });
    return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { error: "홈페이지에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

/** from~until(YYYY-MM-DD, 한국 시간, until 포함)에 만들어진 결제 기록 */
export async function fetchInvitationOrders(from: string, until: string): Promise<OrdersResult> {
  const r = await call(`/api/admin/invitation-orders?from=${from}&until=${until}`, { method: "GET" });
  if ("error" in r) return { ok: false, message: r.error };
  if (r.status === 401) return { ok: false, message: "홈페이지 연동 키가 맞지 않습니다." };
  if (r.status === 404) return { ok: false, message: "홈페이지에 결제내역 조회 기능이 아직 배포되지 않았습니다." };
  const orders = r.data.orders as InvitationOrder[] | undefined;
  if (r.status !== 200 || r.data.code !== "ok" || !orders) return { ok: false, message: String(r.data.message ?? `결제내역을 불러오지 못했습니다 (${r.status}).`) };
  return { ok: true, orders };
}

export type CancelResult = { ok: true; message: string } | { ok: false; message: string };

export async function cancelInvitationPayment(paymentId: string, reason: string, after: "free" | "hide"): Promise<CancelResult> {
  const r = await call("/api/admin/invitation-orders/cancel", { method: "POST", body: JSON.stringify({ paymentId, reason, after }) });
  if ("error" in r) return { ok: false, message: r.error };
  if (r.status === 404) return { ok: false, message: String(r.data.message ?? "홈페이지에 취소 기능이 아직 배포되지 않았거나 결제 기록이 없습니다.") };
  if (r.status !== 200 || r.data.code !== "ok") return { ok: false, message: String(r.data.message ?? `취소하지 못했습니다 (${r.status}).`) };
  return { ok: true, message: r.data.alreadyCancelled ? "이미 취소된 결제입니다. 기록을 맞췄습니다." : `${Number(r.data.refunded ?? 0).toLocaleString("ko-KR")}원 결제를 취소(환불)했습니다.` };
}
