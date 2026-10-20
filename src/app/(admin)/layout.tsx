import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { won } from "@/lib/pricing";
import { monthPaidConfirmed } from "@/lib/monthStats";
import AdminShell from "@/components/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [totalCount, month] = await Promise.all([prisma.reservation.count(), monthPaidConfirmed()]);

  return (
    <AdminShell
      userName={session.user?.name ?? "관리자"}
      totalCount={totalCount}
      confirmedCount={month.count}
      monthAmount={won(month.amount)}
    >
      {children}
    </AdminShell>
  );
}
