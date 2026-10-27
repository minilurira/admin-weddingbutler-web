import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slotsBlockedBy } from "@/lib/calendarBlocks";

import { logError } from "@/lib/errorLog";
export const dynamic = "force-dynamic";

// 홈페이지 예약 화면이 같은 날 이미 잡힌 예식 시각을 알아내는 용도.
// 홈페이지 서버가 RESERVATION_API_KEY로만 호출하고, 시각 목록만 돌려준다(개인정보 없음).
// 취소를 뺀 모든 예약(신규요청·협의중·확정)의 확정 날짜·시간을 기준으로 한다.
export async function GET(req: NextRequest) {
  const apiKey = process.env.RESERVATION_API_KEY;
  if (!apiKey) {
    logError("[api/public/availability] RESERVATION_API_KEY is not set on the server — refusing all requests.");
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const providedKey = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-api-key");
  if (providedKey !== apiKey) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const rows = await prisma.reservation.findMany({
    where: { confirmDate: date, status: { not: "취소" } },
    select: { confirmTime: true },
  });
  const times = Array.from(new Set(rows.map((r) => r.confirmTime).filter((t) => /^\d{2}:\d{2}$/.test(t)))).sort();

  // 어드민 캘린더에서 막아 둔 시간(고를 수 없는 TIME_SLOTS 그대로)
  // 테이블이 아직 없거나 조회가 실패해도 예약 화면이 멈추지 않게, 막은 시간만 빼고 돌려준다.
  const blocks = await prisma.calendarBlock.findMany({ where: { date }, select: { startTime: true, endTime: true } }).catch((err) => {
    logError("[api/public/availability] calendarBlock lookup failed", err);
    return [];
  });
  return NextResponse.json({ times, blocked: slotsBlockedBy(blocks) });
}
