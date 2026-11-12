import { redirect } from "next/navigation";
import { waitUntil } from "@vercel/functions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { won } from "@/lib/pricing";
import { monthPaidConfirmed } from "@/lib/monthStats";
import AdminShell from "@/components/AdminShell";
import { autoBackfillConfirmedEvents } from "@/lib/googleCalendar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // 예식 전인데 구글 캘린더에 없는 확정 예약을 화면을 막지 않고 뒤에서 채운다 (10분에 한 번)
  waitUntil(autoBackfillConfirmedEvents());

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
