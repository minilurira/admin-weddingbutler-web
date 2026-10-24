import { homepageUrl } from "@/lib/records";

// 결제를 끝내지 못한 예약(결제 대기·실패). 홈페이지 DB에만 있어서 홈페이지 API(/api/admin/unpaid-reservations)로 가져온다.
// 결제 상태는 포트원에서 그때그때 읽기 때문에 호출이 몇 초 걸릴 수 있다.

export type UnpaidStage = "before_window" | "window_closed" | "in_progress" | "failed" | "vbank_unpaid" | "paid_unconfirmed" | "cancelled" | "other";

export interface UnpaidRow {
  bookingNo: string;
  name: string;
  phone: string;
  plan: string;
  special: boolean;
  venue: string;
  ceremony: string;
  guests: number;
  amount: number;
  totalAmount: number;
  dbStatus: string;
  createdAt: string;
  pgStatus: string;
  stage: UnpaidStage;
  stageLabel: string;
  hint: string;
  failureReason: string | null;
  recent: boolean;
  isTest: boolean;
}

export type UnpaidResult = { ok: true; days: number; rows: UnpaidRow[]; failed: { bookingNo: string; message: string }[] } | { ok: false; message: string };

export async function fetchUnpaid(days: number): Promise<UnpaidResult> {
  const apiKey = process.env.RESERVATION_API_KEY;
  if (!apiKey) return { ok: false, message: "RESERVATION_API_KEY가 설정되지 않아 홈페이지에 연결할 수 없습니다." };
  let res: Response;
  try {
    res = await fetch(`${homepageUrl()}/api/admin/unpaid-reservations?days=${days}`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" });
  } catch {
    return { ok: false, message: "홈페이지에 연결하지 못했습니다. 잠시 후 다시 열어 주세요." };
  }
  if (res.status === 401) return { ok: false, message: "홈페이지 연동 키가 맞지 않습니다." };
  if (res.status === 404) return { ok: false, message: "홈페이지에 미결제 조회 기능이 아직 배포되지 않았습니다." };
  const data = (await res.json().catch(() => ({}))) as { code?: string; message?: string; rows?: UnpaidRow[]; failed?: { bookingNo: string; message: string }[] };
  if (!res.ok || data.code !== "ok" || !data.rows) return { ok: false, message: data.message ?? `미결제 예약을 불러오지 못했습니다 (${res.status}).` };
  return { ok: true, days, rows: data.rows, failed: data.failed ?? [] };
}
