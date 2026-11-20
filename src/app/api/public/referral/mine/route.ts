import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecordApiKey } from "@/lib/publicApi";
import { normalizePhone } from "@/lib/lookup";
import { issuePartner, myReferral, selfIssueEligible, sendIssueSms, updateSelfAccount } from "@/lib/referral";
import { getTaxProfile, residentNoReady, saveIncomeType, saveResidentNo } from "@/lib/tax";
import { logError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

// 홈페이지 "예약 조회"의 '내 추천 코드' 카드. 홈페이지가 문자 인증을 마친 번호로만 부른다(본인 확인은 홈페이지 세션 쿠키).
//   { phone, action: "get" }                       → { eligible, referral }
//   { phone, action: "issue", agreed: true }       → 이전 결제 고객만 셀프 발급 (기타소득으로 시작)
//   { phone, action: "account", bankName, accountNumber, accountHolder }
//   { phone, action: "resident", residentNo }      → 지급명세서용 주민등록번호(암호화 저장)
export async function POST(req: NextRequest) {
  const denied = requireRecordApiKey(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const phone = normalizePhone(body.phone);
  if (!phone) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });

  try {
    const action = body.action;
    if (action === "get") {
      const [{ eligible }, referral] = await Promise.all([selfIssueEligible(phone), myReferral(phone)]);
      return NextResponse.json({ eligible, referral });
    }

    if (action === "issue") {
      const { eligible, name } = await selfIssueEligible(phone);
      if (!eligible) return NextResponse.json({ error: "not_eligible", message: "결제를 마친 예약이 있는 고객만 코드를 받을 수 있습니다." }, { status: 403 });
      if (body.agreed !== true) return NextResponse.json({ error: "agree_required", message: "영업대행 약관과 개인정보 수집에 동의해 주세요." }, { status: 400 });
      const { partner, created } = await issuePartner({ name, phone, issuedBy: "self", agreed: true });
      if (created) {
        await saveIncomeType("partner", partner.id, "other");
        await sendIssueSms(partner).catch((e) => logError("[referral/mine] issue sms failed", e));
      } else if (!partner.agreedAt) {
        await prisma.referralPartner.update({ where: { id: partner.id }, data: { agreedAt: new Date() } });
      }
      return NextResponse.json({ eligible: true, referral: await myReferral(phone) });
    }

    const exists = await prisma.referralPartner.findUnique({ where: { phone } });
    if (!exists) return NextResponse.json({ error: "no_code", message: "먼저 추천 코드를 받아 주세요." }, { status: 404 });

    if (action === "account") {
      await updateSelfAccount(phone, {
        bankName: String(body.bankName ?? ""),
        accountNumber: String(body.accountNumber ?? ""),
        accountHolder: String(body.accountHolder ?? ""),
      });
      return NextResponse.json({ ok: true, referral: await myReferral(phone) });
    }

    if (action === "resident") {
      if (!residentNoReady()) return NextResponse.json({ error: "unavailable", message: "지금은 주민등록번호를 저장할 수 없습니다. 고객센터로 문의해 주세요." }, { status: 503 });
      await saveResidentNo("partner", exists.id, String(body.residentNo ?? ""));
      if (!(await getTaxProfile("partner", exists.id)).incomeType) await saveIncomeType("partner", exists.id, "other");
      return NextResponse.json({ ok: true, referral: await myReferral(phone) });
    }

    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    // 입력 확인 오류(한국어 문구)는 그대로 보여 준다
    if (/[가-힣]/.test(message)) return NextResponse.json({ error: "invalid", message }, { status: 400 });
    logError("[api/public/referral/mine] failed", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
