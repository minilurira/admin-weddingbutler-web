import { NextRequest, NextResponse } from "next/server";
import { notifyThisMonthButlers, kstToday } from "@/lib/butlerNotice";
import { sendNewReservationKakaoWorkNotice } from "@/lib/kakaowork";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron이 매일 10:00(한국)에 호출한다 (vercel.json). 이번 달 남은 예식의 배정 버틀러 중
// 아직 업무 배정 알림톡을 받지 않은 사람에게 보낸다 — 매월 1일에 그 달 배정분이 한꺼번에 나가고, 실패한 건은 다음 날 다시 시도한다.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = kstToday();
  const lines = await notifyThisMonthButlers(today);
  if (lines.length > 0) await sendNewReservationKakaoWorkNotice([`버틀러 업무 배정 알림톡 (${today})`, ...lines].join("\n"));
  return NextResponse.json({ today, results: lines });
}
