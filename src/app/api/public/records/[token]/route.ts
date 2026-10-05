import { NextRequest, NextResponse } from "next/server";
import { requireRecordApiKey } from "@/lib/publicApi";
import { loadOpenRecord, viewerOf } from "@/lib/publicRecord";
import { maskPhone, planCode } from "@/lib/records";

export const dynamic = "force-dynamic";

// 기록 링크 상태 (명단 제외). 홈페이지가 인증 화면·만료 화면·스몰 화면을 고를 때 쓴다.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const denied = requireRecordApiKey(req);
  if (denied) return denied;

  const found = await loadOpenRecord(params.token, viewerOf(req.url));
  if ("error" in found) return found.error;
  const { link } = found;

  return NextResponse.json({
    state: "ok",
    status: link.status,
    plan: planCode(link.reservation.confirmPlan),
    coupleName: link.reservation.couple,
    phoneMasked: maskPhone(link.reservation.phone),
    expiresAt: link.expiresAt?.toISOString() ?? null,
  });
}
