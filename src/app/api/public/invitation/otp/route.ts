import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecordApiKey } from "@/lib/publicApi";
import { sendSms } from "@/lib/sms";
import { sendInvitationOtpAlimtalk } from "@/lib/alimtalk";
import { LOOKUP_OTP_MAX_SENDS_PER_HOUR, LOOKUP_OTP_TTL_MS, hashLookupOtp, normalizePhone } from "@/lib/lookup";

export const dynamic = "force-dynamic";

// 전체 발송 상한: 10분에 이만큼 넘게 인증번호가 나가면 잠시 막는다 (무작위 번호로 문자를 쏘는 남용 방지)
const GLOBAL_MAX_PER_10_MIN = 120;

// 홈페이지 모바일 청첩장: 만든 사람 확인용 6자리 인증번호. 예약 조회와 달리 예약이 없는 번호에도 보낸다.
// 검증은 예약 조회와 같은 /api/public/lookup/verify 를 쓴다(같은 인증번호 테이블).
export async function POST(req: NextRequest) {
  const denied = requireRecordApiKey(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as { phone?: unknown };
  const phone = normalizePhone(body.phone);
  if (!phone) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });

  const [recentSends, globalSends] = await Promise.all([
    prisma.lookupOtp.count({ where: { phone, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } }),
    prisma.lookupOtp.count({ where: { createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } } }),
  ]);
  if (recentSends >= LOOKUP_OTP_MAX_SENDS_PER_HOUR || globalSends >= GLOBAL_MAX_PER_10_MIN) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.lookupOtp.create({
    data: { phone, codeHash: hashLookupOtp(phone, code), expiresAt: new Date(Date.now() + LOOKUP_OTP_TTL_MS) },
  });

  // 알림톡으로 먼저 보내고, 템플릿이 아직 없거나 실패하면 문자로 보낸다.
  const sent =
    (await sendInvitationOtpAlimtalk(phone, code)) ||
    (await sendSms(phone, `[웨딩버틀러] 모바일 청첩장 인증번호는 ${code} 입니다. 5분 안에 입력해 주세요.`, `invitation ${phone.slice(-4)}`));
  if (!sent) return NextResponse.json({ error: "sms_failed" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
