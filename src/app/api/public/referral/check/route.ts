import { NextRequest, NextResponse } from "next/server";
import { requireRecordApiKey } from "@/lib/publicApi";
import { maskName, normalizeCode, partnerByCode } from "@/lib/referral";

export const dynamic = "force-dynamic";

// 홈페이지 예약창이 입력한 추천 코드를 확인한다. { code } → { valid, name(가린 이름) } | { valid: false, reason }
export async function POST(req: NextRequest) {
  const denied = requireRecordApiKey(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  const code = normalizeCode(body.code);
  if (!code) return NextResponse.json({ valid: false, reason: "not_found" });
  const p = await partnerByCode(code);
  if (!p) return NextResponse.json({ valid: false, reason: "not_found" });
  if (p.status !== "active") return NextResponse.json({ valid: false, reason: "blocked" });
  return NextResponse.json({ valid: true, code: p.code, name: maskName(p.name) });
}
