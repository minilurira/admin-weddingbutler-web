// 원천징수 계산 (브라우저에서도 쓰는 순수 함수). 저장·암호화는 src/lib/tax.ts

export const INCOME_TYPES = {
  business: { label: "사업소득 3.3%", short: "사업 3.3%" },
  other: { label: "기타소득 8.8%", short: "기타 8.8%" },
  daily: { label: "일용근로소득", short: "일용" },
  none: { label: "원천징수 안 함", short: "징수 안 함" },
} as const;
export type IncomeType = keyof typeof INCOME_TYPES;
export const isIncomeType = (v: unknown): v is IncomeType => typeof v === "string" && v in INCOME_TYPES;

/** 기타소득: 1회 지급액이 이 금액 이하면 과세최저한(기타소득금액 5만원 이하)으로 세액 0원 */
export const OTHER_INCOME_TAX_FREE_MAX = 125_000;
/** 일용근로소득 하루 근로소득공제 */
export const DAILY_DEDUCTION = 150_000;
/** 원천징수세액이 이 금액 미만이면 떼지 않는다(소액부징수) */
export const SMALL_TAX_EXEMPT_UNDER = 1_000;

const floor10 = (n: number) => Math.floor(n / 10) * 10;

export interface Withholding {
  gross: number;
  incomeTax: number;
  localTax: number;
  net: number;
  note: string;
}

/**
 * 1회 지급액의 원천징수. 세액은 10원 미만 절사.
 * - 사업소득: 3% + 지방 0.3%
 * - 기타소득: 필요경비 60% 공제 후 20% = 8% + 지방 0.8%. 1회 125,000원 이하면 0원
 * - 일용근로: (하루 지급액 − 150,000) × 6% × (1 − 55% 세액공제) = 2.7% + 지방 10%. 하루 단위로 계산한다
 */
export function withholding(type: IncomeType, gross: number): Withholding {
  const g = Math.max(0, Math.floor(gross));
  let incomeTax = 0;
  let note = "";
  if (type === "business") {
    incomeTax = floor10(g * 0.03);
  } else if (type === "other") {
    if (g <= OTHER_INCOME_TAX_FREE_MAX) note = "125,000원 이하 과세최저한";
    else incomeTax = floor10(g * 0.08);
  } else if (type === "daily") {
    incomeTax = floor10(Math.max(0, g - DAILY_DEDUCTION) * 0.06 * 0.45);
  }
  if (incomeTax > 0 && incomeTax < SMALL_TAX_EXEMPT_UNDER) {
    incomeTax = 0;
    note = "1,000원 미만 소액부징수";
  }
  const localTax = floor10(incomeTax * 0.1);
  return { gross: g, incomeTax, localTax, net: g - incomeTax - localTax, note };
}

/** 일용근로는 하루씩 계산해 더한다 */
export function dailyWithholding(days: number[]): Withholding {
  const parts = days.map((d) => withholding("daily", d));
  const sum = (k: "gross" | "incomeTax" | "localTax" | "net") => parts.reduce((a, p) => a + p[k], 0);
  return { gross: sum("gross"), incomeTax: sum("incomeTax"), localTax: sum("localTax"), net: sum("net"), note: "" };
}

