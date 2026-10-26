"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { cancelInvitationPayment } from "@/lib/invitationOrders";
import { normalizePhone } from "@/lib/lookup";
import { sendSms } from "@/lib/sms";

async function guard() {
  if (!(await getServerSession(authOptions))) throw new Error("로그인이 필요합니다.");
}

/** 결제 전액 취소(환불). PG 취소가 성공했을 때만 홈페이지가 기록을 바꾼다. */
export async function cancelInvitationOrder(paymentId: string, reason: string, after: "free" | "hide"): Promise<{ ok: boolean; message: string }> {
  await guard();
  const why = String(reason ?? "").trim().slice(0, 100);
  if (!why) return { ok: false, message: "취소 사유를 입력해 주세요." };
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(String(paymentId))) return { ok: false, message: "결제번호를 확인해 주세요." };
  const res = await cancelInvitationPayment(paymentId, why, after === "hide" ? "hide" : "free");
  revalidatePath("/invitation-orders");
  if (!res.ok) return res;
  // 환불 안내 문자: 카드 취소는 이미 끝났으므로 문자가 실패해도 취소 결과는 그대로 두고 알려만 준다.
  if (res.notify) {
    const phone = normalizePhone(res.notify.phone);
    const names = [res.notify.groom, res.notify.bride].filter(Boolean).join("·");
    const text = `[웨딩버틀러] ${names ? `${names} 님 ` : ""}모바일 청첩장 프리미엄 결제 ${res.notify.amount.toLocaleString("ko-KR")}원이 취소되어 환불 처리되었습니다. 카드사에 따라 취소 내역이 반영되기까지 영업일 기준 3~7일이 걸릴 수 있어요. 문의는 웨딩버틀러 홈페이지로 남겨 주세요.`;
    const sent = phone ? await sendSms(phone, text, `invitation refund ${phone.slice(-4)}`) : false;
    return { ok: true, message: sent ? `${res.message} 고객에게 환불 안내 문자를 보냈습니다.` : `${res.message} 다만 환불 안내 문자는 보내지 못했습니다. 고객에게 직접 알려 주세요.` };
  }
  return res;
}
