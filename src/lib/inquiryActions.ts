"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { updateInquiries } from "@/lib/inquiries";

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
