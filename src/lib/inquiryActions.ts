"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { getInquiry, listInquiries, updateInquiries } from "@/lib/inquiries";
import { sendInquiryReplyAlimtalk } from "@/lib/alimtalk";
import { sendSms } from "@/lib/sms";
import { INQUIRY_REPLY_MAX, charCount, inquiryReplyText } from "@/lib/inquiryReply";
import { appendReply } from "@/lib/inquiryReplyLog";

import { logError } from "@/lib/errorLog";
async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("로그인이 필요합니다.");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setInquiriesHandled(ids: string[], handled: boolean) {
  await requireSession();
  await updateInquiries(ids.filter((id) => UUID.test(id)), { handled_at: handled ? new Date().toISOString() : null });
  revalidatePath("/inquiries");
}

export async function saveInquiryMemo(id: string, memo: string) {
  await requireSession();
  if (!UUID.test(id)) throw new Error("잘못된 문의입니다.");
  await updateInquiries([id], { admin_memo: memo.trim() });
  revalidatePath("/inquiries");
}

export type ReplyResult = { ok: true; channel: "알림톡" | "문자"; saved: boolean } | { ok: false; message: string };

/** 고객에게 답변을 보낸다 — 알림톡 먼저, 안 되면 문자. 보낸 답변·시각·경로를 저장하고 처리완료로 표시한다.
 * 운영 빌드에서는 서버 액션의 throw 메시지가 화면에 안 보이므로 결과를 값으로 돌려준다. */
export async function sendInquiryReply(id: string, text: string): Promise<ReplyResult> {
  await requireSession();
  if (!UUID.test(id)) return { ok: false, message: "잘못된 문의입니다." };
  const answer = text.trim();
  if (!answer) return { ok: false, message: "답변 내용을 입력해 주세요." };
  if (charCount(answer) > INQUIRY_REPLY_MAX) return { ok: false, message: `답변은 ${INQUIRY_REPLY_MAX}자까지 보낼 수 있습니다.` };
  const inquiry = await getInquiry(id);
  if (!inquiry) return { ok: false, message: "문의를 찾을 수 없습니다." };

  const fields = { name: inquiry.name, topic: inquiry.topic, answer };
  let channel: "알림톡" | "문자" = "알림톡";
  if (!(await sendInquiryReplyAlimtalk(inquiry.phone, fields))) {
    channel = "문자";
    const ok = await sendSms(inquiry.phone, inquiryReplyText(fields.name, fields.topic, answer), `inquiry reply ${id}`);
    if (!ok) return { ok: false, message: "답변을 보내지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  // 이미 보낸 뒤라 저장이 실패해도 오류로 돌려주지 않는다(다시 보내면 고객이 두 번 받음).
  const now = new Date().toISOString();
  let saved = true;
  try {
    await updateInquiries([id], {
      // 이전에 보낸 답변을 지우지 않고 뒤에 쌓는다
      reply_text: appendReply(inquiry, { at: now, channel, text: answer }),
      replied_at: now,
      reply_channel: channel,
      ...(inquiry.handled_at ? {} : { handled_at: now }),
    });
  } catch (err) {
    logError(`[inquiries] reply sent but not saved for ${id}`, err);
    saved = false;
  }
  revalidatePath("/inquiries");
  return { ok: true, channel, saved };
}

export interface OpenInquiry {
  id: string;
  name: string;
  phone: string;
  ceremonyDate: string;
  topic: string;
  createdAt: string;
  handled: boolean;
}

/** 새 예약 등록의 [문의에서 가져오기]: 문의 전체를 최신순으로 (화면에서 미처리/전체를 고른다) */
export async function listOpenInquiries(): Promise<{ ok: true; items: OpenInquiry[] } | { ok: false; message: string }> {
  await requireSession();
  try {
    const rows = await listInquiries();
    return {
      ok: true,
      items: rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, ceremonyDate: r.ceremony_date ?? "", topic: r.topic, createdAt: r.created_at, handled: Boolean(r.handled_at) })),
    };
  } catch (err) {
    logError("[listOpenInquiries] failed", err);
    return { ok: false, message: "문의 목록을 불러오지 못했습니다." };
  }
}
