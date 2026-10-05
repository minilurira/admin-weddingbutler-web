import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecordApiKey } from "@/lib/publicApi";
import { loadOpenRecord } from "@/lib/publicRecord";
import { OTP_MAX_SENDS_PER_HOUR, OTP_TTL_MS, hashOtp, maskPhone } from "@/lib/records";
import { sendSms } from "@/lib/sms";

export const dynamic = "force-dynamic";

// 예약자 번호로 6자리 인증번호 문자 발송. 1시간에 5회까지.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const denied = requireRecordApiKey(req);
  if (denied) return denied;

  const found = await loadOpenRecord(params.token, "customer");
  if ("error" in found) return found.error;
  const { link } = found;

  const recentSends = await prisma.recordAccess.count({
    where: { recordLinkId: link.id, kind: "otp", createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recentSends >= OTP_MAX_SENDS_PER_HOUR) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.recordAccess.create({
    data: {
      recordLinkId: link.id,
      kind: "otp",
      codeHash: hashOtp(link.id, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  const sent = await sendSms(
    link.reservation.phone,
    `[웨딩버틀러] 축의 기록 인증번호는 ${code} 입니다. 5분 안에 입력해 주세요.`,
    `record ${link.reservationId}`
  );
  if (!sent) return NextResponse.json({ error: "sms_failed" }, { status: 502 });

  return NextResponse.json({ ok: true, phoneMasked: maskPhone(link.reservation.phone) });
}
