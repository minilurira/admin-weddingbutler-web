import { NextRequest, NextResponse } from "next/server";
import { requireRecordApiKey } from "@/lib/publicApi";
import { getInviteView, respondInvite } from "@/lib/butlerInvite";

export const dynamic = "force-dynamic";

// 홈페이지 서버만 부르는 버틀러 참석 문의 API (Authorization: Bearer RESERVATION_API_KEY).
//   GET  → { state, info?, locked? }   (state: pending | available | unavailable | cancelled | expired | not_found)
//   POST { action: "accept" | "decline" } → { state }
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const denied = requireRecordApiKey(req);
  if (denied) return denied;
  return NextResponse.json(await getInviteView(params.token));
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const denied = requireRecordApiKey(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "accept" && body.action !== "decline") return NextResponse.json({ error: "unknown action" }, { status: 400 });
  return NextResponse.json(await respondInvite(params.token, body.action));
}
