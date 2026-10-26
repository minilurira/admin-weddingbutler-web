"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { cancelInvitationPayment, type CancelResult } from "@/lib/invitationOrders";

async function guard() {
  if (!(await getServerSession(authOptions))) throw new Error("로그인이 필요합니다.");
}

/** 결제 전액 취소(환불). PG 취소가 성공했을 때만 홈페이지가 기록을 바꾼다. */
export async function cancelInvitationOrder(paymentId: string, reason: string, after: "free" | "hide"): Promise<CancelResult> {
  await guard();
  const why = String(reason ?? "").trim().slice(0, 100);
  if (!why) return { ok: false, message: "취소 사유를 입력해 주세요." };
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(String(paymentId))) return { ok: false, message: "결제번호를 확인해 주세요." };
  const res = await cancelInvitationPayment(paymentId, why, after === "hide" ? "hide" : "free");
  revalidatePath("/invitation-orders");
  return res;
}
