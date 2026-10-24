import { NextRequest, NextResponse } from "next/server";
import { requireRecordApiKey } from "@/lib/publicApi";
import { getOffer, holdOffer, releaseOffer, stateOf, useOffer } from "@/lib/special";

export const dynamic = "force-dynamic";

// 홈페이지 서버만 부르는 스페셜 예약 링크 API (Authorization: Bearer RESERVATION_API_KEY).
//   GET  → { state, amount, label, expiresAt }   (state: open | held | used | cancelled | expired | not_found)
//   POST { action: "hold" | "use" | "release", bookingNo } → { ok }
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const denied = requireRecordApiKey(req);
  if (denied) return denied;
  if (!TOKEN.test(params.token)) return NextResponse.json({ state: "not_found" });
  const offer = await getOffer(params.token);
  if (!offer) return NextResponse.json({ state: "not_found" });
  return NextResponse.json({ state: stateOf(offer), amount: offer.amount, label: offer.label, expiresAt: offer.expiresAt.toISOString() });
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const denied = requireRecordApiKey(req);
  if (denied) return denied;
  if (!TOKEN.test(params.token)) return NextResponse.json({ ok: false }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; bookingNo?: string };
  const bookingNo = typeof body.bookingNo === "string" ? body.bookingNo.trim() : "";
  if (!bookingNo) return NextResponse.json({ ok: false, error: "bookingNo is required" }, { status: 400 });

  const fn = body.action === "hold" ? holdOffer : body.action === "use" ? useOffer : body.action === "release" ? releaseOffer : null;
  if (!fn) return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  return NextResponse.json({ ok: await fn(params.token, bookingNo) });
}
