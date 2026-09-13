export type PlanKey = "스몰케어" | "스탠다드" | "프리미엄";

export interface PlanMeta {
  key: PlanKey;
  desc: string;
  butlers: number;
  base: number;
  guestLimit: number;
}

export const PLANS: PlanMeta[] = [
  { key: "스몰케어", desc: "하객 200명 이하 · 웨딩버틀러 2명", butlers: 2, base: 390000, guestLimit: 200 },
  { key: "스탠다드", desc: "하객 300명 이하 · 웨딩버틀러 2명", butlers: 2, base: 450000, guestLimit: 300 },
  { key: "프리미엄", desc: "양가 각 200명 기준 · 웨딩버틀러 4명", butlers: 4, base: 800000, guestLimit: 400 },
];

// Matches src/lib/plans.ts in the weddingbutler homepage repo — keep in sync.
export const EXTRA_BUTLER_FEE = 100000;
export const EXTRA_GUEST_FEE = 2000;

export function planMeta(key: string): PlanMeta {
  return PLANS.find((p) => p.key === key) ?? PLANS[1];
}

export function won(v: number): string {
  return v.toLocaleString("ko-KR") + "원";
}

export interface ConfirmInput {
  plan: string;
  butlers: number;
  extraGuests: number;
  discount: number;
}

export interface PriceBreakdown {
  meta: PlanMeta;
  butlers: number;
  extraButlers: number;
  guestFee: number;
  butlerFee: number;
  discount: number;
  total: number;
  prepay: number;
  balance: number;
}

export function calcConfirm(input: ConfirmInput): PriceBreakdown {
  const meta = planMeta(input.plan);
  const extraButlers = Math.max(0, input.butlers - meta.butlers);
  const guestFee = input.extraGuests * EXTRA_GUEST_FEE;
  const butlerFee = extraButlers * EXTRA_BUTLER_FEE;
  const discount = input.discount;
  const total = Math.max(0, meta.base + guestFee + butlerFee - discount);
  const prepay = Math.round(total / 2);
  return { meta, butlers: input.butlers, extraButlers, guestFee, butlerFee, discount, total, prepay, balance: total - prepay };
}

export function requestedTotal(planKey: string, guestsLabel: string) {
  const meta = planMeta(planKey);
  const guestCount = Number(String(guestsLabel).replace(/[^0-9]/g, "")) || 0;
  const extraGuests = Math.max(0, guestCount - meta.guestLimit);
  const guestFee = extraGuests * EXTRA_GUEST_FEE;
  const total = meta.base + guestFee;
  const prepay = Math.round(total / 2);
  return { meta, extraGuests, guestFee, total, prepay, balance: total - prepay };
}
