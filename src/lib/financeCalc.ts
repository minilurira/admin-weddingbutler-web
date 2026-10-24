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
