"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadMessages, type MessageView } from "@/lib/messageView";

export async function getMessages(reservationId: string): Promise<MessageView[]> {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("로그인이 필요합니다.");
  return loadMessages(reservationId);
}
