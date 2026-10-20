"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { updateInquiry } from "@/lib/inquiries";

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("로그인이 필요합니다.");
}

export async function setInquiryHandled(id: string, handled: boolean) {
  await requireSession();
  await updateInquiry(id, { handled_at: handled ? new Date().toISOString() : null });
  revalidatePath("/inquiries");
}

export async function saveInquiryMemo(id: string, memo: string) {
  await requireSession();
  await updateInquiry(id, { admin_memo: memo.trim() });
  revalidatePath("/inquiries");
}
