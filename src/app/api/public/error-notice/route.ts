import { NextRequest, NextResponse } from "next/server";
import { requireRecordApiKey } from "@/lib/publicApi";
import { notifyErrorRoom } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

/** 홈페이지가 오류 기록을 저장한 뒤 알림만 요청한다 (알림방·카카오워크 봇은 어드민이 관리). */
export async function POST(req: NextRequest) {
  const denied = requireRecordApiKey(req);
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as { source?: string; scope?: string; message?: string };
  if (typeof b.message !== "string" || !b.message) return NextResponse.json({ error: "message required" }, { status: 400 });
  await notifyErrorRoom(b.source === "browser" ? "browser" : "home", String(b.scope ?? "").slice(0, 80), b.message.slice(0, 500));
  return new NextResponse(null, { status: 204 });
}
