"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { loadExtraGuest, sendExtraGuestClaim, type ExtraGuestView } from "@/lib/extraGuest";

async function guard() {
  if (!(await getServerSession(authOptions))) throw new Error("로그인이 필요합니다.");
}

export async function getExtraGuest(reservationId: string): Promise<ExtraGuestView> {
  await guard();
  return loadExtraGuest(reservationId);
}

export async function claimExtraGuests(reservationId: string, extraGuests: number, includeBalance: boolean, smsOnly = false) {
  await guard();
  const res = await sendExtraGuestClaim(reservationId, extraGuests, includeBalance, smsOnly);
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  return res;
}
