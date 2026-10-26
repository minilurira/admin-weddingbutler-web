"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TIME_SLOTS } from "@/lib/format";
import { datesBetween } from "@/lib/calendarBlocks";

export type BlockResult = { ok: true; message: string } | { ok: false; message: string };

const MAX_DAYS = 62;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function guard() {
  if (!(await getServerSession(authOptions))) throw new Error("로그인이 필요합니다.");
}

/** 날짜(여러 날 가능)와 시간대를 막는다. startTime·endTime을 모두 비우면 종일. */
export async function createCalendarBlocks(input: { from: string; to: string; startTime: string; endTime: string; reason: string }): Promise<BlockResult> {
  await guard();
  const from = String(input.from ?? "");
  const to = String(input.to || input.from || "");
  if (!DATE.test(from) || !DATE.test(to)) return { ok: false, message: "날짜를 확인해 주세요." };
  if (to < from) return { ok: false, message: "끝나는 날이 시작하는 날보다 빠릅니다." };
  const startTime = String(input.startTime ?? "");
  const endTime = String(input.endTime ?? "");
  const allDay = !startTime && !endTime;
  if (!allDay) {
    if (!TIME_SLOTS.includes(startTime) || !TIME_SLOTS.includes(endTime)) return { ok: false, message: "시간을 확인해 주세요." };
    if (endTime < startTime) return { ok: false, message: "끝나는 시간이 시작 시간보다 빠릅니다." };
  }
  const dates = datesBetween(from, to);
  if (dates.length > MAX_DAYS) return { ok: false, message: `한 번에 ${MAX_DAYS}일까지만 막을 수 있어요.` };
  const reason = String(input.reason ?? "").trim().slice(0, 40);
  await prisma.calendarBlock.createMany({ data: dates.map((date) => ({ date, startTime, endTime, reason })) });
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return { ok: true, message: `${dates.length > 1 ? `${dates.length}일을 ` : ""}${allDay ? "종일" : `${startTime}~${endTime}`} 막았습니다.` };
}

export async function deleteCalendarBlock(id: string): Promise<BlockResult> {
  await guard();
  const r = await prisma.calendarBlock.deleteMany({ where: { id: String(id) } });
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return r.count ? { ok: true, message: "막은 것을 풀었습니다." } : { ok: false, message: "이미 풀린 항목입니다." };
}
