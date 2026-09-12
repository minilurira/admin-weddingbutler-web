import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcConfirm, won } from "@/lib/pricing";
import AdminShell from "@/components/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [totalCount, confirmed] = await Promise.all([
    prisma.reservation.count(),
    prisma.reservation.findMany({ where: { status: "확정" } }),
  ]);

  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthConfirmed = confirmed.filter((r) => r.confirmDate.startsWith(monthPrefix));
  const monthAmount = monthConfirmed.reduce(
    (sum, r) => sum + calcConfirm({ plan: r.confirmPlan, butlers: r.confirmButlers, extraGuests: r.confirmExtraGuests, discount: r.confirmDiscount }).total,
    0
  );

  return (
    <AdminShell
      userName={session.user?.name ?? "관리자"}
      totalCount={totalCount}
      confirmedCount={monthConfirmed.length}
      monthAmount={won(monthAmount)}
    >
      {children}
    </AdminShell>
  );
}
