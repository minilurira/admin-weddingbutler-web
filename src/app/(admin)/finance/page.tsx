import { prisma } from "@/lib/prisma";
import { ensureFinanceTables, getFinanceSettings } from "@/lib/finance";
import { reservationTotal } from "@/lib/view";
import FinanceView, { type FinanceData } from "@/components/FinanceView";

export const dynamic = "force-dynamic";

const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export default async function FinancePage() {
  let data: FinanceData | null = null;
  let error = "";
  try {
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
    data = {
      today: kstToday(),
      settings,
      reservations: reservations.map((r) => ({
        id: r.id,
        date: r.confirmDate,
        couple: r.customer,
        plan: r.confirmPlan,
        total: reservationTotal(r),
        card: r.paidAmount,
        cash: cashMap.get(r.id) ?? null,
      })),
      costs: costs.map((c) => ({ id: c.id, name: c.name, amount: c.amount, kind: c.kind === "monthly" ? "monthly" : "once", date: c.date, memo: c.memo })),
      butlers: butlers.map((b) => ({ id: b.id, name: b.name })),
      shifts: shifts.map((s) => ({ id: s.id, butlerId: s.butlerId, date: s.date, rid: s.reservationId, pay: s.pay, paid: s.paid })),
    };
  } catch (e) {
    console.error("[finance] load failed", e);
    error = "정산 데이터를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.";
  }

  return (
    <main style={{ flex: 1, minWidth: 0, padding: "4px 28px 48px" }}>
      {data ? <FinanceView data={data} /> : <p style={{ color: "#A8416C", fontWeight: 600 }}>{error}</p>}
    </main>
  );
}
