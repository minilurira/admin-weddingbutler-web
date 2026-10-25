// 정산 계산에 쓰는 순수 함수·상수 (서버/클라이언트 공용: prisma를 가져오지 않는다)

/** 신용카드 수수료율은 부가세 별도로 계약하므로 실제 부담은 요율 × 1.1 */
export const CARD_FEE_VAT = 1.1;
/** 신용카드 정산주기: 결제 후 7영업일에 입금 */
export const CARD_SETTLE_BUSINESS_DAYS = 7;

export const cardFee = (card: number, ratePercent: number) => Math.round((card * ratePercent * CARD_FEE_VAT) / 100);

// 영업일 계산용 공휴일. 홈페이지 src/lib/booking-calendar.ts 의 HOLIDAYS 와 같은 값 — 예약 가능일을 늘릴 때 함께 갱신한다.
const HOLIDAYS = new Set([
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-01", "2026-03-02", "2026-05-05", "2026-05-24", "2026-05-25",
  "2026-06-06", "2026-08-15", "2026-08-17", "2026-09-24", "2026-09-25", "2026-09-26", "2026-10-03", "2026-10-05", "2026-10-09", "2026-12-25",
  "2027-01-01", "2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09", "2027-03-01", "2027-05-01", "2027-05-03", "2027-05-05", "2027-05-13",
]);

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** "YYYY-MM-DD"에서 n영업일 뒤 날짜 (토·일·공휴일 제외, 시작일은 세지 않음) */
export function addBusinessDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !HOLIDAYS.has(iso(d))) left--;
  }
  return iso(d);
}

/** 버틀러 등급과 건당 기본 정산금. 오너 버틀러는 대표(이강, 최소연). 금액을 바꿀 땐 여기만 고친다. */
export const BUTLER_GRADES = {
  staff: { label: "스태프 버틀러", pay: 75000 },
  manager: { label: "매니저 버틀러", pay: 95000 },
  owner: { label: "오너 버틀러", pay: 150000 },
} as const;
export type ButlerGrade = keyof typeof BUTLER_GRADES;

export const isButlerGrade = (v: unknown): v is ButlerGrade => typeof v === "string" && v in BUTLER_GRADES;
/** 등급의 건당 기본 정산금 (알 수 없는 등급은 스태프로 본다) */
export const gradePay = (grade: string): number => BUTLER_GRADES[isButlerGrade(grade) ? grade : "staff"].pay;
/** 한 건의 정산 합계 = 기본 정산금 + 스페셜 차지(오너가 추가로 지급하는 돈) */
export const shiftTotal = (s: { pay: number; extra: number }): number => s.pay + s.extra;

/** 오너 버틀러 정산금을 두 대표가 나누는 비율 (%). 합이 100이어야 한다. */
/** 오너 등급 한 건은 두 대표가 함께 하는 것으로 보아, 건당 정산금 × 2명이 배분 대상이다. */
export const OWNER_HEADCOUNT = 2;
export const OWNER_SPLIT = { 이강: 49, 최소연: 51 } as const;

/** 오너 정산금 합계를 이강:최소연 = 49:51로 나눈다. 이강 몫을 원 단위로 반올림하고 나머지를 최소연 몫으로 해서 합이 항상 정확히 맞는다. */
export function splitOwnerPay(pool: number): { 이강: number; 최소연: number } {
  const 이강 = Math.round((pool * OWNER_SPLIT.이강) / 100);
  return { 이강, 최소연: pool - 이강 };
}

/**
 * 오너 정산금 배분 대상 합계. 오너 등급 기록이 있는 예약마다 한 번, 1인 기본 정산금 × 2명으로 센다.
 * 두 대표를 한 예약에 각각 배정해 오너 기록이 2개여도 그 예약은 한 번만 들어간다.
 */
export function ownerPool(shifts: readonly { rid: string; grade: string; pay: number }[]): { count: number; pool: number } {
  const per = new Map<string, number>();
  for (const s of shifts) if (s.grade === "owner") per.set(s.rid, Math.max(per.get(s.rid) ?? 0, s.pay));
  let pool = 0;
  per.forEach((pay) => { pool += pay * OWNER_HEADCOUNT; });
  return { count: per.size, pool };
}
