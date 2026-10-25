import { prisma } from "@/lib/prisma";
import { ensureFinanceTables, getFinanceSettings } from "@/lib/finance";
import { reservationTotal } from "@/lib/view";
import type { FinanceData } from "@/components/FinanceView";

const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/** 손익관리·버틀러 관리 두 화면이 함께 쓰는 데이터 */
export async function loadFinanceData(): Promise<FinanceData> {
  await ensureFinanceTables();
  const [reservations, cash, costs, butlers, shifts, settings] = await Promise.all([
    prisma.reservation.findMany({ where: { status: "확정", confirmDate: { not: "" } }, orderBy: { confirmDate: "asc" } }),
    prisma.financeCash.findMany(),
    prisma.financeCost.findMany({ orderBy: { date: "asc" } }),
    prisma.butler.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.butlerShift.findMany({ orderBy: { date: "asc" } }),
    getFinanceSettings(),
  ]);
  const cashMap = new Map(cash.map((c) => [c.reservationId, c.amount]));
  return {
    today: kstToday(),
    settings,
    reservations: reservations.map((r) => ({
      id: r.id,
      date: r.confirmDate,
      couple: r.customer,
      plan: r.confirmPlan,
      total: reservationTotal(r),
      card: r.paidAmount,
      paidDate: new Date(r.requestedAt.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10), // 접수(결제) 날짜, 한국시간
      cash: cashMap.get(r.id) ?? null,
    })),
    costs: costs.map((c) => ({ id: c.id, name: c.name, amount: c.amount, kind: c.kind === "monthly" ? "monthly" : "once", date: c.date, memo: c.memo })),
    butlers: butlers.map((b) => ({ id: b.id, name: b.name, grade: b.grade })),
    shifts: shifts.map((s) => ({ id: s.id, butlerId: s.butlerId, date: s.date, rid: s.reservationId, grade: s.grade, pay: s.pay, extra: s.extra, paid: s.paid, paidDate: s.paidDate })),
  };
}
