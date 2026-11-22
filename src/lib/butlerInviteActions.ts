"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cancelInvite, createInvites, listInvites, resendInvite, type CreateInput, type InviteRow } from "@/lib/butlerInvite";

async function guard() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("로그인이 필요합니다.");
}

export async function getInvites(reservationId: string): Promise<InviteRow[]> {
  await guard();
  return listInvites(reservationId);
}

export async function sendInvites(input: CreateInput): Promise<string> {
  await guard();
  return createInvites(input);
}

export async function resendInviteAction(id: string): Promise<string> {
  await guard();
  return resendInvite(id);
}

export async function cancelInviteAction(id: string): Promise<string> {
  await guard();
  await cancelInvite(id);
  return "문의를 취소했습니다.";
}
