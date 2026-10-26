"use server";

import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/lookup";

// 관리자 계정 관리: 로그인한 관리자만. 휴대폰은 "비밀번호 찾기" 인증번호를 받는 번호다.

export type AdminResult = { ok: true; message: string } | { ok: false; message: string };

async function guard() {
  if (!(await getServerSession(authOptions))) throw new Error("로그인이 필요합니다.");
}

/** 빈 값이면 번호를 지운다 */
function parsePhone(raw: string): { ok: true; phone: string } | { ok: false } {
  const t = String(raw ?? "").trim();
  if (!t) return { ok: true, phone: "" };
  const p = normalizePhone(t);
  return p ? { ok: true, phone: p } : { ok: false };
}

export async function saveAdminPhone(id: string, phoneRaw: string): Promise<AdminResult> {
  await guard();
  const p = parsePhone(phoneRaw);
  if (!p.ok) return { ok: false, message: "휴대폰 번호를 확인해 주세요. (예: 010-1234-5678)" };
  const r = await prisma.adminUser.updateMany({ where: { id }, data: { phone: p.phone } });
  if (r.count === 0) return { ok: false, message: "계정을 찾을 수 없습니다." };
  revalidatePath("/admins");
  return { ok: true, message: p.phone ? "휴대폰 번호를 저장했습니다." : "휴대폰 번호를 지웠습니다. 이 계정은 비밀번호 찾기를 쓸 수 없습니다." };
}

export async function setAdminPassword(id: string, password: string): Promise<AdminResult> {
  await guard();
  const pw = String(password ?? "");
  if (pw.length < 8 || pw.length > 72) return { ok: false, message: "비밀번호는 8자 이상으로 입력해 주세요." };
  const r = await prisma.adminUser.updateMany({ where: { id }, data: { passwordHash: await bcrypt.hash(pw, 10) } });
  if (r.count === 0) return { ok: false, message: "계정을 찾을 수 없습니다." };
  return { ok: true, message: "비밀번호를 바꿨습니다." };
}

export async function createAdminUser(input: { name: string; username: string; password: string; phone: string }): Promise<AdminResult> {
  await guard();
  const name = String(input.name ?? "").trim().slice(0, 30);
  const username = String(input.username ?? "").trim();
  if (!name) return { ok: false, message: "이름을 입력해 주세요." };
  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username)) return { ok: false, message: "아이디는 영문·숫자·_ . - 로 3~30자여야 합니다." };
  if (String(input.password ?? "").length < 8) return { ok: false, message: "비밀번호는 8자 이상으로 입력해 주세요." };
  const p = parsePhone(input.phone);
  if (!p.ok) return { ok: false, message: "휴대폰 번호를 확인해 주세요. (예: 010-1234-5678)" };
  if (await prisma.adminUser.findUnique({ where: { username } })) return { ok: false, message: "이미 있는 아이디입니다." };
  await prisma.adminUser.create({ data: { name, username, passwordHash: await bcrypt.hash(input.password, 10), phone: p.phone } });
  revalidatePath("/admins");
  return { ok: true, message: `${name} 님 계정을 만들었습니다.` };
}
