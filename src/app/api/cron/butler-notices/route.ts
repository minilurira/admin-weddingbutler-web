import { NextRequest, NextResponse } from "next/server";
import { notifyThisMonthButlers, kstToday } from "@/lib/butlerNotice";
import { sendNewReservationKakaoWorkNotice } from "@/lib/kakaowork";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron이 매월 1일 10:00(한국)에만 호출한다 (vercel.json, 2026-11-14 루리님 요청으로 매일 → 매월 1일).
// 그 달 예식의 배정 버틀러 중 그 달 안에 업무 배정 알림톡을 받지 않은 사람에게 한꺼번에 보낸다
// (배정할 때 이미 한 번 받았어도 지난달 이전에 받았으면 다시 보낸다 — src/lib/butlerNotice.ts).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = kstToday();
  const lines = await notifyThisMonthButlers(today);
  if (lines.length > 0) await sendNewReservationKakaoWorkNotice([`버틀러 업무 배정 알림톡 (${today})`, ...lines].join("\n"));
  return NextResponse.json({ today, results: lines });
}
