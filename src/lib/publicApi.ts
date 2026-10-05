import { NextRequest, NextResponse } from "next/server";
import { recordApiKey } from "@/lib/records";

/** 홈페이지 서버만 부르는 /api/public/records/* 인증. 통과하면 null. */
export function requireRecordApiKey(req: NextRequest): NextResponse | null {
  const apiKey = recordApiKey();
  if (!apiKey) {
    console.error("[api/public/records] RECORD_API_KEY / RESERVATION_API_KEY is not set — refusing all requests.");
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-api-key");
  if (provided !== apiKey) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}
