import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureReferralTables } from "@/lib/referral";
import { getResidentNo, getTaxProfiles, INCOME_TYPES, withholding, type IncomeType } from "@/lib/tax";
import { shiftTotal } from "@/lib/financeCalc";

export const dynamic = "force-dynamic";

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const kstDate = (d: Date) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 원천세 신고용 내역(관리자 전용): 그 달에 지급한 영업대행 정산 + 버틀러 정산. 주민등록번호 전체가 들어간다.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "month=YYYY-MM" }, { status: 400 });

  await ensureReferralTables();
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1) - 9 * 3600 * 1000);
  const to = new Date(Date.UTC(y, m, 1) - 9 * 3600 * 1000);

  const rows: (string | number)[][] = [["구분", "지급일", "성명", "주민등록번호", "소득 구분", "지급액", "소득세", "지방소득세", "실지급액", "비고"]];

  const payouts = await prisma.referralPayout.findMany({ where: { paidAt: { gte: from, lt: to }, cancelledAt: null }, orderBy: { paidAt: "asc" } });
  const partners = await prisma.referralPartner.findMany({ where: { id: { in: payouts.map((p) => p.partnerId) } } });
  const pName = new Map(partners.map((p) => [p.id, p.name]));
  for (const x of payouts) {
    rows.push(["영업대행", kstDate(x.paidAt), pName.get(x.partnerId) ?? "", await getResidentNo("partner", x.partnerId), INCOME_TYPES[x.incomeType as IncomeType]?.label ?? x.incomeType,
      x.grossAmount, x.incomeTax, x.localTax, x.netAmount, `예식 ${x.period}`]);
  }

  const shifts = await prisma.butlerShift.findMany({ where: { paid: true, paidDate: { startsWith: month } }, include: { butler: true }, orderBy: [{ paidDate: "asc" }, { date: "asc" }] });
  const taxes = await getTaxProfiles("butler", Array.from(new Set(shifts.map((s) => s.butlerId))));
  for (const s of shifts) {
    const t = taxes.get(s.butlerId)?.incomeType || "";
    const w = t ? withholding(t, shiftTotal(s)) : { gross: shiftTotal(s), incomeTax: 0, localTax: 0, net: shiftTotal(s), note: "소득 구분 미지정" };
    rows.push(["버틀러", s.paidDate, s.butler.name, await getResidentNo("butler", s.butlerId), t ? INCOME_TYPES[t].label : "미지정",
      w.gross, w.incomeTax, w.localTax, w.net, [`근무 ${s.date}`, w.note].filter(Boolean).join(" · ")]);
  }

  const csv = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="withholding-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
