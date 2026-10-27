import { prisma } from "@/lib/prisma";
import type { CalBlock } from "@/components/FullCalendar";

import { logError } from "@/lib/errorLog";
/** 날짜별로 묶은 막은 시간. 테이블이 아직 없어도 화면이 멈추지 않게 빈 값을 돌려준다. */
export async function blocksByDate(): Promise<Record<string, CalBlock[]>> {
  const rows = await prisma.calendarBlock.findMany({ orderBy: [{ date: "asc" }, { startTime: "asc" }] }).catch((err) => {
    logError("[calendar] calendarBlock lookup failed (아직 테이블을 만들지 않았나요?)", err);
    return [];
  });
  const out: Record<string, CalBlock[]> = {};
  for (const r of rows) (out[r.date] ??= []).push({ id: r.id, startTime: r.startTime, endTime: r.endTime, reason: r.reason });
  return out;
}
