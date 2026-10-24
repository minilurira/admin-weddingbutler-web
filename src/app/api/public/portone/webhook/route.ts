import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { applyPaymentWebhook } from "@/lib/paymentLink";

export const dynamic = "force-dynamic";

// 포트원 V1 웹훅 (콘솔 → 결제연동 → 웹훅 → V1에 이 주소 등록). 어드민 결제 링크의 결제 결과는 이걸로만 온다.
// 본문(imp_uid, merchant_uid, status)은 누구나 보낼 수 있으므로 믿지 않고, imp_uid로 포트원에 다시 조회해 반영한다.
// 처리 중 오류면 500을 돌려 포트원이 다시 보내게 한다.
export async function POST(req: NextRequest) {
  const type = req.headers.get("content-type") ?? "";
  let impUid = "";
  if (type.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as { imp_uid?: unknown };
    impUid = typeof body.imp_uid === "string" ? body.imp_uid : "";
  } else {
    const form = await req.formData().catch(() => null);
    const v = form?.get("imp_uid");
    impUid = typeof v === "string" ? v : "";
  }
  if (!impUid) return NextResponse.json({ error: "imp_uid is required" }, { status: 400 });

  try {
    const outcome = await applyPaymentWebhook(impUid);
    if (outcome === "applied") {
      revalidatePath("/reservations");
      revalidatePath("/dashboard");
      revalidatePath("/calendar");
    }
    console.log(`[portone/webhook] ${impUid}: ${outcome}`);
    return NextResponse.json({ ok: true, outcome });
  } catch (err) {
    console.error(`[portone/webhook] failed for ${impUid}`, err);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
