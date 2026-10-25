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

export async function claimExtraGuests(reservationId: string, actualGuests: number) {
  await guard();
  const res = await sendExtraGuestClaim(reservationId, actualGuests);
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  return res;
}
