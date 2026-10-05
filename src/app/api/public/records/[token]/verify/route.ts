import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecordApiKey } from "@/lib/publicApi";
import { loadOpenRecord } from "@/lib/publicRecord";
import { OTP_MAX_ATTEMPTS, otpMatches } from "@/lib/records";

export const dynamic = "force-dynamic";

// 가장 최근 인증번호와 비교. 5회 틀리면 새 번호를 받아야 한다.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const denied = requireRecordApiKey(req);
  if (denied) return denied;

  const found = await loadOpenRecord(params.token, "customer");
  if ("error" in found) return found.error;
  const { link } = found;

  let code = "";
  try {
    const body = (await req.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code.replace(/[^0-9]/g, "") : "";
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (code.length !== 6) return NextResponse.json({ error: "mismatch" }, { status: 400 });

  const otp = await prisma.recordAccess.findFirst({
    where: { recordLinkId: link.id, kind: "otp" },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || !otp.codeHash || otp.verifiedAt || !otp.expiresAt || otp.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 400 });
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) return NextResponse.json({ error: "locked" }, { status: 429 });

  if (!otpMatches(link.id, code, otp.codeHash)) {
    await prisma.recordAccess.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    return NextResponse.json({ error: "mismatch", remaining: OTP_MAX_ATTEMPTS - otp.attempts - 1 }, { status: 400 });
  }

  await prisma.recordAccess.update({ where: { id: otp.id }, data: { verifiedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
