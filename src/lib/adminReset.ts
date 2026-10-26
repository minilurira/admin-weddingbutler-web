"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { LOOKUP_OTP_MAX_ATTEMPTS, LOOKUP_OTP_MAX_SENDS_PER_HOUR, LOOKUP_OTP_TTL_MS, hashLookupOtp, lookupOtpMatches, normalizePhone } from "@/lib/lookup";

// 어드민 비밀번호 찾기: 아이디 → 그 계정에 등록된 휴대폰으로 인증번호(문자) → 새 비밀번호.
// 인증번호는 예약 조회와 같은 LookupOtp 표를 쓰되, 키를 "admin-reset:아이디"로 분리해 서로 섞이지 않게 한다.
// 아이디가 있는지 없는지는 알려 주지 않는다(같은 안내를 돌려준다).

export type ResetResult = { ok: true } | { ok: false; message: string };

const key = (username: string) => `admin-reset:${username.trim().toLowerCase()}`;
const GENERIC = "인증번호가 맞지 않거나 만료되었습니다. 다시 받아 주세요.";

export async function requestAdminReset(usernameRaw: string): Promise<ResetResult> {
  const username = String(usernameRaw ?? "").trim();
  if (!username || username.length > 60) return { ok: false, message: "아이디를 입력해 주세요." };
  const k = key(username);

  const [recent, global] = await Promise.all([
    prisma.lookupOtp.count({ where: { phone: k, createdAt: { gte: new Date(Date.now() - 3600 * 1000) } } }),
    prisma.lookupOtp.count({ where: { phone: { startsWith: "admin-reset:" }, createdAt: { gte: new Date(Date.now() - 600 * 1000) } } }),
  ]);
  if (recent >= LOOKUP_OTP_MAX_SENDS_PER_HOUR || global >= 20) return { ok: false, message: "요청이 너무 많습니다. 잠시 뒤에 다시 시도해 주세요." };

  const user = await prisma.adminUser.findUnique({ where: { username } });
  const phone = normalizePhone(user?.phone);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  // 없는 아이디도 같은 기록을 남겨 횟수 제한이 똑같이 걸리게 하고, 문자는 등록된 번호가 있을 때만 보낸다.
  await prisma.lookupOtp.create({ data: { phone: k, codeHash: hashLookupOtp(k, code), expiresAt: new Date(Date.now() + LOOKUP_OTP_TTL_MS) } });
  if (user && phone) {
    const sent = await sendSms(phone, `[웨딩버틀러 어드민] 비밀번호 재설정 인증번호는 ${code} 입니다. 5분 안에 입력해 주세요.`, `admin-reset ${phone.slice(-4)}`);
    if (!sent) return { ok: false, message: "문자를 보내지 못했습니다. 잠시 뒤에 다시 시도해 주세요." };
  }
  return { ok: true };
}

export async function resetAdminPassword(usernameRaw: string, codeRaw: string, newPassword: string): Promise<ResetResult> {
  const username = String(usernameRaw ?? "").trim();
  const code = String(codeRaw ?? "").replace(/[^0-9]/g, "");
  const pw = String(newPassword ?? "");
  if (!username || code.length !== 6) return { ok: false, message: GENERIC };
  if (pw.length < 8 || pw.length > 72) return { ok: false, message: "새 비밀번호는 8자 이상으로 입력해 주세요." };

  const k = key(username);
  const otp = await prisma.lookupOtp.findFirst({ where: { phone: k }, orderBy: { createdAt: "desc" } });
  if (!otp || otp.verifiedAt || otp.expiresAt.getTime() < Date.now()) return { ok: false, message: GENERIC };
  if (otp.attempts >= LOOKUP_OTP_MAX_ATTEMPTS) return { ok: false, message: "인증번호를 여러 번 틀렸습니다. 새 인증번호를 받아 주세요." };
  if (!lookupOtpMatches(k, code, otp.codeHash)) {
    await prisma.lookupOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, message: GENERIC };
  }

  const user = await prisma.adminUser.findUnique({ where: { username } });
  // 없는 아이디는 위에서 인증번호가 문자로 나가지 않았으므로 여기까지 오지 못한다. 그래도 한 번 더 막는다.
  if (!user || !normalizePhone(user.phone)) return { ok: false, message: GENERIC };
  await prisma.$transaction([
    prisma.lookupOtp.update({ where: { id: otp.id }, data: { verifiedAt: new Date() } }),
    prisma.adminUser.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(pw, 10) } }),
  ]);
  return { ok: true };
}
