import { NextRequest, NextResponse } from "next/server";
import { kstToday, notifyTomorrowButlers } from "@/lib/butlerNotice";
import { sendNewReservationKakaoWorkNotice } from "@/lib/kakaowork";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron이 매일 10:00(한국)에 호출한다 (vercel.json). 내일 예식의 배정 버틀러(오너 포함)에게 업무 1일 전 안내를 보낸다.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = kstToday();
  const lines = await notifyTomorrowButlers(today);
  if (lines.length > 0) await sendNewReservationKakaoWorkNotice([`버틀러 업무 1일 전 안내 (${today} 발송)`, ...lines].join("\n"));
  return NextResponse.json({ today, results: lines });
}
