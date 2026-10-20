"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { won } from "@/lib/pricing";
import { monthPaidConfirmed } from "@/lib/monthStats";

// 사이드바 하단 숫자. 레이아웃은 페이지를 옮겨도 다시 그려지지 않으므로 화면 이동마다 이걸로 새로 받는다.
export async function getSidebarStats() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("로그인이 필요합니다.");
  const [totalCount, month] = await Promise.all([prisma.reservation.count(), monthPaidConfirmed()]);
  return { totalCount, confirmedCount: month.count, monthAmount: won(month.amount) };
}
