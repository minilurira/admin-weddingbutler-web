import { prisma } from "@/lib/prisma";
import { ensureFinanceTables, getFinanceSettings } from "@/lib/finance";
import { reservationTotal } from "@/lib/view";
import { cashReceivedBy } from "@/lib/cashReceipt";
import { EXTRA_GUEST_FEE } from "@/lib/pricing";
import type { FinanceLink } from "@/lib/financeCalc";
import type { FinanceData } from "@/components/FinanceView";

const kstDay = (d: Date) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const kstToday = () => kstDay(new Date());

function parsePayments(raw: string): Record<string, string> {
  try {
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? Object.fromEntries(Object.entries(o).filter(([k, v]) => /^\d{4}-\d{2}$/.test(k) && typeof v === "string")) as Record<string, string> : {};
  } catch { return {}; }
}

/** 손익관리·버틀러 관리 두 화면이 함께 쓰는 데이터 */
export async function loadFinanceData(): Promise<FinanceData> {
  await ensureFinanceTables();
  const [reservations, cash, costs, butlers, shifts, settings] = await Promise.all([
    prisma.reservation.findMany({ where: { status: "확정", confirmDate: { not: "" } }, orderBy: { confirmDate: "asc" }, include: { paymentLinks: { where: { status: { in: ["sent", "paid"] } } } } }),
    prisma.financeCash.findMany(),
    prisma.financeCost.findMany({ orderBy: { date: "asc" } }),
    prisma.butler.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.butlerShift.findMany({ orderBy: { date: "asc" } }),
    getFinanceSettings(),
  ]);
  const cashMap = new Map(cash.map((c) => [c.reservationId, c.amount]));
  // "현금 수령"으로 기록한 돈은 예약의 결제 금액(paidAmount)에 더해져 있어서, 카드에서 빼고 현금으로 센다
  const receivedBy = await cashReceivedBy(reservations.map((r) => r.id));
  return {
    today: kstToday(),
    settings,
    reservations: reservations.map((r) => ({
      id: r.id,
      date: r.confirmDate,
      couple: r.customer,
      plan: r.confirmPlan,
      total: reservationTotal(r),
      card: Math.max(0, r.paidAmount - (receivedBy.get(r.id) ?? 0)),
      received: receivedBy.get(r.id) ?? 0,
      paidDate: kstDay(r.requestedAt), // 접수(결제) 날짜, 한국시간
      cash: cashMap.has(r.id) ? Math.max(cashMap.get(r.id)!, receivedBy.get(r.id) ?? 0) : null,
      links: r.paymentLinks.flatMap((l): FinanceLink[] => {
        if (l.status === "paid") return [{ paid: true, amount: l.paidAmount - l.refundedAmount, balance: 0, date: kstDay(l.paidAt ?? l.createdAt) }];
        if (l.expiresAt.getTime() <= Date.now()) return []; // 기한이 지난 미결제 링크는 다시 현장 현금으로 본다
        return [{ paid: false, amount: l.amount, balance: Math.max(0, l.amount - l.extraGuests * EXTRA_GUEST_FEE), date: kstDay(l.expiresAt) }];
      }),
    })),
    costs: costs.map((c) => ({ id: c.id, name: c.name, amount: c.amount, kind: c.kind === "monthly" ? "monthly" : "once", date: c.date, memo: c.memo, payments: parsePayments(c.payments) })),
    butlers: butlers.map((b) => ({ id: b.id, name: b.name, grade: b.grade, bankName: b.bankName, accountNumber: b.accountNumber, accountHolder: b.accountHolder, phone: b.phone })),
    shifts: shifts.map((s) => ({ id: s.id, butlerId: s.butlerId, date: s.date, rid: s.reservationId, grade: s.grade, pay: s.pay, extra: s.extra, paid: s.paid, paidDate: s.paidDate })),
  };
}
