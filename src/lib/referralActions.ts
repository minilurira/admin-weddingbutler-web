"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { attachReferral, cancelPayout, detachReferral, ensureReferralTables, issuePartner, sendIssueSms, settlePartner } from "@/lib/referral";
import { isIncomeType, residentNoReady, RESIDENT_KEY_MISSING, saveIncomeType, saveResidentNo, type TaxOwner } from "@/lib/tax";

type Result = { ok: boolean; message: string };

async function guard(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("로그인이 필요합니다.");
  await ensureReferralTables();
  return session.user?.name ?? "관리자";
}

const fail = (e: unknown): Result => ({ ok: false, message: e instanceof Error ? e.message : "처리하지 못했습니다." });

/** 어드민 발급: 누구에게나. 이미 코드가 있는 번호면 그 코드를 알려 준다. */
export async function issueReferralCode(input: {
  name: string; phone: string; ratePercent: number; incomeType: string; memo: string; sendSms: boolean;
  bankName: string; accountNumber: string; accountHolder: string;
}): Promise<Result & { code?: string }> {
  try {
    await guard();
    const { partner, created } = await issuePartner({ ...input, issuedBy: "admin" });
    if (!created) return { ok: false, message: `이미 ${partner.name}님에게 발급된 코드(${partner.code})가 있습니다.`, code: partner.code };
    if (isIncomeType(input.incomeType)) await saveIncomeType("partner", partner.id, input.incomeType);
    if (partner.accountNumber) await prisma.referralPartner.update({ where: { id: partner.id }, data: { accountCheckedAt: new Date() } });
    const sms = input.sendSms ? await sendIssueSms(partner) : false;
    revalidatePath("/referrals");
    return { ok: true, code: partner.code, message: `${partner.name}님 코드 ${partner.code}를 발급했습니다.${input.sendSms ? (sms ? " 문자를 보냈습니다." : " 문자는 보내지 못했습니다.") : ""}` };
  } catch (e) {
    return fail(e);
  }
}

export async function resendReferralSms(partnerId: string): Promise<Result> {
  try {
    await guard();
    const p = await prisma.referralPartner.findUnique({ where: { id: partnerId } });
    if (!p) return { ok: false, message: "코드 주인을 찾을 수 없습니다." };
    return (await sendIssueSms(p)) ? { ok: true, message: "코드 안내 문자를 보냈습니다." } : { ok: false, message: "문자를 보내지 못했습니다." };
  } catch (e) {
    return fail(e);
  }
}

export async function updateReferralPartner(partnerId: string, input: {
  name?: string; ratePercent?: number; memo?: string; status?: "active" | "blocked";
  bankName?: string; accountNumber?: string; accountHolder?: string; accountChecked?: boolean;
}): Promise<Result> {
  try {
    await guard();
    const p = await prisma.referralPartner.findUnique({ where: { id: partnerId } });
    if (!p) return { ok: false, message: "코드 주인을 찾을 수 없습니다." };
    const data: Record<string, unknown> = {};
    if (typeof input.name === "string" && input.name.trim()) data.name = input.name.trim().slice(0, 30);
    if (typeof input.ratePercent === "number") {
      if (!(input.ratePercent > 0 && input.ratePercent <= 30)) return { ok: false, message: "수수료율은 0보다 크고 30% 이하로 입력해 주세요." };
      data.ratePercent = Math.round(input.ratePercent * 10) / 10;
    }
    if (typeof input.memo === "string") data.memo = input.memo.trim().slice(0, 200);
    if (input.status === "active" || input.status === "blocked") data.status = input.status;
    const acctChanged = ["bankName", "accountNumber", "accountHolder"].some((k) => typeof input[k as keyof typeof input] === "string");
    if (acctChanged) {
      data.bankName = (input.bankName ?? p.bankName).trim().slice(0, 20);
      data.accountNumber = (input.accountNumber ?? p.accountNumber).replace(/[^0-9-]/g, "").slice(0, 30);
      data.accountHolder = (input.accountHolder ?? p.accountHolder).trim().slice(0, 30);
      // 관리자가 직접 입력한 계좌는 확인한 것으로 본다
      data.accountCheckedAt = data.accountNumber ? new Date() : null;
    }
    if (typeof input.accountChecked === "boolean") data.accountCheckedAt = input.accountChecked ? new Date() : null;
    await prisma.referralPartner.update({ where: { id: partnerId }, data });
    // 수수료율을 바꾸면 아직 정산 전인 건에도 적용한다
    if (typeof data.ratePercent === "number") {
      await prisma.referralCommission.updateMany({ where: { partnerId, status: { in: ["pending", "ready"] } }, data: { ratePercent: data.ratePercent as number } });
    }
    revalidatePath("/referrals");
    return { ok: true, message: "저장했습니다." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteReferralPartner(partnerId: string): Promise<Result> {
  try {
    await guard();
    const used = await prisma.referralCommission.count({ where: { partnerId } });
    if (used) return { ok: false, message: "이 코드로 들어온 예약이 있어 삭제할 수 없습니다. 대신 '정지'해 주세요." };
    await prisma.referralPartner.delete({ where: { id: partnerId } });
    revalidatePath("/referrals");
    return { ok: true, message: "코드를 삭제했습니다." };
  } catch (e) {
    return fail(e);
  }
}

/** 소득 구분·주민등록번호 (영업대행·버틀러 공통) */
export async function saveTaxInfo(ownerType: TaxOwner, id: string, input: { incomeType?: string; residentNo?: string }): Promise<Result & { masked?: string }> {
  try {
    await guard();
    if (ownerType !== "partner" && ownerType !== "butler") return { ok: false, message: "잘못된 요청입니다." };
    if (input.incomeType !== undefined) {
      if (!isIncomeType(input.incomeType)) return { ok: false, message: "소득 구분을 골라 주세요." };
      await saveIncomeType(ownerType, id, input.incomeType);
    }
    let masked: string | undefined;
    if (input.residentNo) {
      if (!residentNoReady()) return { ok: false, message: RESIDENT_KEY_MISSING };
      masked = await saveResidentNo(ownerType, id, input.residentNo);
    }
    revalidatePath(ownerType === "partner" ? "/referrals" : "/butlers");
    return { ok: true, message: "저장했습니다.", masked };
  } catch (e) {
    return fail(e);
  }
}

export async function settleReferral(input: { partnerId: string; commissionIds: string[]; grossOverride: number | null; memo: string }): Promise<Result> {
  try {
    const by = await guard();
    const res = await settlePartner({ ...input, paidBy: by });
    revalidatePath("/referrals");
    return res;
  } catch (e) {
    return fail(e);
  }
}

export async function cancelReferralPayout(payoutId: string): Promise<Result> {
  try {
    await guard();
    const res = await cancelPayout(payoutId);
    revalidatePath("/referrals");
    return res;
  } catch (e) {
    return fail(e);
  }
}

/** 예약 상세: 추천 코드 연결·해제 */
export async function setReservationReferral(reservationId: string, code: string): Promise<Result> {
  try {
    await guard();
    if (!code.trim()) {
      const res = await detachReferral(reservationId);
      revalidatePath("/reservations");
      return res;
    }
    const res = await attachReferral(reservationId, code);
    revalidatePath("/reservations");
    return res.ok ? { ok: true, message: `${res.partner.name}님 추천 코드를 연결했습니다.` } : { ok: false, message: res.message };
  } catch (e) {
    return fail(e);
  }
}
