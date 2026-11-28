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
/** 등급의 건당 기본 정산금 (알 수 없는 등급은 스태프로 본다). 오너 등급은 이강 147,000 / 최소연 153,000, 그 밖의 이름은 150,000. */
export const gradePay = (grade: string, name?: string): number =>
  grade === "owner" && (name === "이강" || name === "최소연") ? ownerPay(name) : BUTLER_GRADES[isButlerGrade(grade) ? grade : "staff"].pay;
/** 한 건의 정산 합계 = 기본 정산금 + 스페셜 차지(오너가 추가로 지급하는 돈) */
export const shiftTotal = (s: { pay: number; extra: number }): number => s.pay + s.extra;

/** 오너 등급 한 건은 두 대표가 함께 하므로 건당 정산금 × 2명이 배분 대상이다. */
export const OWNER_HEADCOUNT = 2;
/** 오너 버틀러 정산금을 두 대표가 나누는 비율 (%). 합이 100이어야 한다. */
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
  const rids = new Set<string>();
  for (const s of shifts) if (s.grade === "owner") rids.add(s.rid);
  return { count: rids.size, pool: rids.size * BUTLER_GRADES.owner.pay * OWNER_HEADCOUNT };
}

/**
 * 회사 자체 수익 = 순수익에서 오너 몫까지 뺀 금액. 순수익에 이미 들어 있는 오너 기본 정산금(기록 금액)은
 * 오너 몫(예약당 300,000원)으로 바꿔 계산해 두 번 빼지 않는다. 한 분만 기록한 예약도 오너 몫 전액을 뺀다.
 */
export function companyProfit(net: number, shifts: readonly { rid: string; grade: string; pay: number }[]): number {
  const recorded = shifts.reduce((a, s) => a + (s.grade === "owner" ? s.pay : 0), 0);
  return net + recorded - ownerPool(shifts).pool;
}

/** 예약에 보낸 결제 링크 중 통장 예상에 필요한 것. paid: 결제된 금액(환불 뺀 값)과 결제일. 미결제: 청구액, 그중 잔금 몫(balance), 예상 결제일(기한). */
export interface FinanceLink { paid: boolean; amount: number; balance: number; date: string }

/** 예약의 입금을 나눈다: 접수 때 카드(card − 링크로 결제된 금액), 링크 카드(결제됨·대기), 현장 현금.
 * 결제 대기 중인 링크가 담은 잔금은 현금에서 빼고 카드로 본다. 현금을 이미 입력했으면 그 값을 쓴다. */
export function splitInflow(r: { total: number; card: number; cash: number | null; links?: readonly FinanceLink[] }) {
  const links = r.links ?? [];
  const paid = links.filter((l) => l.paid), pending = links.filter((l) => !l.paid);
  const baseCard = Math.max(0, r.card - paid.reduce((a, l) => a + l.amount, 0));
  const cash = r.cash ?? Math.max(0, r.total - r.card - pending.reduce((a, l) => a + l.balance, 0));
  return { baseCard, linkCards: [...paid, ...pending], pending, cash };
}

/**
 * 예정 예약까지 포함한 누적 회사 자체 수익.
 * 수입 = 모든 확정 예약의 카드(수수료 제외) + 현금. 아직 안 치른 예식(today 이후)의 미입력 잔금은 총액 − 카드로 예상하고, 지난 예식은 입력한 현금만 센다.
 * 비용 = 모든 버틀러 정산(예정 배정 포함) + 일회성 비용 전부 + 월 비용(시작월부터 기록이 있는 마지막 달까지). 오너 몫은 companyProfit 규칙.
 * 배정 전 예약(unassigned)은 버틀러 정산·오너 몫이 아직 빠지지 않는다.
 */
export function companyProfitAll(
  reservations: readonly { id: string; date: string; card: number; cash: number | null; total: number; links?: readonly FinanceLink[] }[],
  costs: readonly { kind: string; amount: number; date: string }[],
  shifts: readonly { rid: string; date: string; grade: string; pay: number; extra: number }[],
  feeRate: number,
  today: string,
): { profit: number; count: number; unassigned: number; expectedCash: number; endMonth: string } {
  const endMonth = [today, ...reservations.map((r) => r.date), ...shifts.map((s) => s.date), ...costs.map((c) => c.date)].map((d) => d.slice(0, 7)).sort().pop()!;
  const monthIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
  let income = 0, expectedCash = 0, unassigned = 0;
  const assigned = new Set(shifts.map((s) => s.rid));
  for (const r of reservations) {
    const upcoming = r.date >= today;
    const split = splitInflow(r);
    const expected = r.cash === null && upcoming ? split.cash : 0;
    const pendingCard = split.pending.reduce((a, l) => a + l.amount, 0); // 결제 대기 링크는 카드로 들어올 예정
    expectedCash += expected;
    income += r.card - cardFee(r.card, feeRate) + pendingCard - cardFee(pendingCard, feeRate) + (r.cash ?? expected);
    if (upcoming && !assigned.has(r.id)) unassigned++;
  }
  const cost = costs.reduce((a, c) => a + c.amount * (c.kind === "monthly" ? monthIndex(endMonth) - monthIndex(c.date.slice(0, 7)) + 1 : 1), 0)
    + shifts.reduce((a, s) => a + shiftTotal(s), 0);
  return { profit: companyProfit(income - cost, shifts), count: reservations.length, unassigned, expectedCash, endMonth };
}

/** 오너 등급 한 건에서 대표 한 명의 기본 정산금: 두 대표 합 300,000원을 49:51로 → 이강 147,000 / 최소연 153,000 */
export const ownerPay = (name: keyof typeof OWNER_SPLIT): number => splitOwnerPay(BUTLER_GRADES.owner.pay * OWNER_HEADCOUNT)[name];

/**
 * 통장 잔액 예상용 비용 출금(건별): 비용의 각 지급 건(월 비용은 시작월부터 마지막 달까지 달마다, 일회성은 한 번)이 나가는 날을
 * 정하고(지급 완료면 실제 지급일, 아니면 예정일) 기준일 이후이고 keys 안의 달에 속한 건만 돌려준다.
 */
export function costOutflowEvents(
  costs: readonly { kind: string; name?: string; amount: number; date: string; payments: Record<string, string> }[],
  keys: readonly string[],
  base: string,
): { when: string; amount: number; kind: "once" | "monthly"; name: string }[] {
  const out: { when: string; amount: number; kind: "once" | "monthly"; name: string }[] = [];
  const last = keys[keys.length - 1];
  for (const x of costs) {
    const months: string[] = [];
    if (x.kind === "once") months.push(x.date.slice(0, 7));
    else {
      let [y, m] = x.date.slice(0, 7).split("-").map(Number);
      for (; `${y}-${String(m).padStart(2, "0")}` <= last; m++) {
        if (m > 12) { m = 1; y++; }
        months.push(`${y}-${String(m).padStart(2, "0")}`);
      }
    }
    for (const mk of months) {
      const when = x.payments[mk] ?? (x.kind === "once" ? x.date : `${mk}-${x.date.slice(8)}`);
      if (when > base && keys.includes(when.slice(0, 7))) out.push({ when, amount: x.amount, kind: x.kind === "once" ? "once" : "monthly", name: x.name ?? "비용" });
    }
  }
  return out;
}

/** 위 건별 출금을 달별 월 비용(mon)·일회성(one)으로 합산한다. */
export function costOutflowByMonth(
  costs: readonly { kind: string; name?: string; amount: number; date: string; payments: Record<string, string> }[],
  keys: readonly string[],
  base: string,
): Record<string, { mon: number; one: number }> {
  const out: Record<string, { mon: number; one: number }> = Object.fromEntries(keys.map((k) => [k, { mon: 0, one: 0 }]));
  for (const e of costOutflowEvents(costs, keys, base)) out[e.when.slice(0, 7)][e.kind === "once" ? "one" : "mon"] += e.amount;
  return out;
}
