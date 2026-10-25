export type PlanKey = "스몰케어" | "스탠다드" | "프리미엄" | "스페셜";

/** 스페셜: 요금표 없이 예약마다 금액을 정하는 요금제. 금액은 예약의 requestedTotal(홈페이지가 보낸 총액)에 담긴다. */
export const SPECIAL_PLAN = "스페셜";

export interface PlanMeta {
  key: PlanKey;
  desc: string;
  butlers: number;
  base: number;
  guestLimit: number;
}

export const PLANS: PlanMeta[] = [
  { key: "스몰케어", desc: "하객 100명 이하 · 웨딩버틀러 2명", butlers: 2, base: 390000, guestLimit: 100 },
  { key: "스탠다드", desc: "하객 101~200명 · 웨딩버틀러 2명", butlers: 2, base: 450000, guestLimit: 200 },
  { key: "프리미엄", desc: "양가 각 200명 기준 · 웨딩버틀러 4명", butlers: 4, base: 800000, guestLimit: 400 },
  { key: "스페셜", desc: "맞춤 금액 · 웨딩버틀러 2명", butlers: 2, base: 0, guestLimit: 9999 },
];

// 축의대 구분. 스몰케어·스탠다드는 한쪽(신랑측/신부측), 프리미엄은 양가.
export const SIDES = ["신랑측", "신부측", "양가"] as const;
export type Side = (typeof SIDES)[number];

export function isSide(v: unknown): v is Side {
  return typeof v === "string" && (SIDES as readonly string[]).includes(v);
}

/** 홈페이지가 보내는 값("groom" | "bride" | "both")을 어드민 표기로 바꾼다. 모르는 값은 "". */
export function sideFromHomepage(v: unknown): Side | "" {
  if (v === "groom") return "신랑측";
  if (v === "bride") return "신부측";
  if (v === "both") return "양가";
  return "";
}

// Matches src/lib/plans.ts in the weddingbutler homepage repo — keep in sync.
export const EXTRA_BUTLER_FEE = 100000;
export const EXTRA_GUEST_FEE = 2000;

export function planMeta(key: string): PlanMeta {
  return PLANS.find((p) => p.key === key) ?? PLANS[1];
}

/** 2026-10-25 약관 개정 전 예약의 기준 하객(스몰케어 200명, 스탠다드 300명). 종전 약관이 적용된다. */
const GUEST_LIMIT_CHANGED_AT = new Date("2026-10-25T00:00:00+09:00");
const LEGACY_GUEST_LIMIT: Partial<Record<PlanKey, number>> = { 스몰케어: 200, 스탠다드: 300 };

/** 예약 접수 시점에 적용되는 기준 하객 수. */
export function guestLimitAt(meta: PlanMeta, bookedAt: Date): number {
  if (bookedAt < GUEST_LIMIT_CHANGED_AT) return LEGACY_GUEST_LIMIT[meta.key] ?? meta.guestLimit;
  return meta.guestLimit;
}

export function won(v: number): string {
  return v.toLocaleString("ko-KR") + "원";
}

export interface ConfirmInput {
  plan: string;
  butlers: number;
  extraGuests: number;
  discount: number;
  /** 스페셜 요금제의 기본 금액(= 예약의 requestedTotal). 다른 요금제에서는 무시한다. */
  baseOverride?: number;
}

export interface PriceBreakdown {
  meta: PlanMeta;
  butlers: number;
  extraButlers: number;
  guestFee: number;
  butlerFee: number;
  discount: number;
  total: number;
}

export function calcConfirm(input: ConfirmInput): PriceBreakdown {
  const found = planMeta(input.plan);
  const meta = found.key === SPECIAL_PLAN ? { ...found, base: Math.max(0, Math.floor(input.baseOverride ?? 0)) } : found;
  const extraButlers = Math.max(0, input.butlers - meta.butlers);
  const guestFee = input.extraGuests * EXTRA_GUEST_FEE;
  const butlerFee = extraButlers * EXTRA_BUTLER_FEE;
  const discount = input.discount;
  const total = Math.max(0, meta.base + guestFee + butlerFee - discount);
  return { meta, butlers: input.butlers, extraButlers, guestFee, butlerFee, discount, total };
}

export function requestedTotal(planKey: string, guestsLabel: string) {
  const meta = planMeta(planKey);
  const guestCount = Number(String(guestsLabel).replace(/[^0-9]/g, "")) || 0;
  const extraGuests = Math.max(0, guestCount - meta.guestLimit);
  const guestFee = extraGuests * EXTRA_GUEST_FEE;
  const total = meta.base + guestFee;
  return { meta, extraGuests, guestFee, total };
}

// 홈페이지 예약 결제 유형 — src/lib/plans.ts의 PaymentType과 같은 값.
export type PaymentType = "deposit" | "full";

export const PAYMENT_TYPES: Record<PaymentType, { name: string; short: string }> = {
  deposit: { name: "예약금 결제 후 현장결제", short: "예약금" },
  full: { name: "전액결제", short: "전액" },
};

/** 홈페이지 예약금(예약금 결제 후 현장결제) 금액 */
export const DEPOSIT_AMOUNT = 100000;

/** 결제 링크 기본 청구 금액: 전액결제면 요금제 기본가, 아니면 예약금 */
export function paymentLinkDefaultAmount(planKey: string, paymentType: string): number {
  return paymentType === "full" ? planMeta(planKey).base : DEPOSIT_AMOUNT;
}

export function isPaymentType(v: unknown): v is PaymentType {
  return v === "deposit" || v === "full";
}

/** 저장된 유형이 없으면(이전 예약) 결제한 금액으로 추정한다. */
export function resolvePaymentType(stored: string, paidAmount: number, total: number): PaymentType | null {
  if (isPaymentType(stored)) return stored;
  if (paidAmount <= 0) return null;
  return paidAmount >= total ? "full" : "deposit";
}

export function paymentTypeName(stored: string, paidAmount: number, total: number): string {
  const t = resolvePaymentType(stored, paidAmount, total);
  return t ? PAYMENT_TYPES[t].name : "미지정";
}

/** 현장에서 현금으로 받을 금액 = 총 금액 − 결제한 금액. */
export function onsiteAmount(total: number, paidAmount: number): number {
  return Math.max(0, total - paidAmount);
}

interface PricedReservation {
  confirmPlan: string;
  confirmButlers: number;
  confirmExtraGuests: number;
  confirmDiscount: number;
  requestedTotal: number;
}

/** 예약 1건의 확정 총액. 스페셜은 예약에 담긴 금액(requestedTotal)이 기본 요금이 된다. */
export function confirmTotalOf(r: PricedReservation): number {
  return calcConfirm({ plan: r.confirmPlan, butlers: r.confirmButlers, extraGuests: r.confirmExtraGuests, discount: r.confirmDiscount, baseOverride: r.requestedTotal }).total;
}

/** 알림톡 등에 보여 줄 "플랜 가격". 스페셜은 그 예약의 금액. */
export function planBaseOf(r: { confirmPlan: string; requestedTotal: number }): number {
  return r.confirmPlan === SPECIAL_PLAN ? r.requestedTotal : planMeta(r.confirmPlan).base;
}
