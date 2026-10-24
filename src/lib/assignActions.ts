"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { createAssignment, loadAssignment, removeAssignment, type AssignmentView } from "@/lib/assign";

async function guard() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("로그인이 필요합니다.");
}

const done = () => {
  revalidatePath("/finance");
  revalidatePath("/butlers");
  revalidatePath("/reservations");
};

export async function getAssignment(reservationId: string): Promise<AssignmentView> {
  await guard();
  return loadAssignment(reservationId);
}

export async function assignButler(reservationId: string, butlerId: string, grade: string): Promise<void> {
  await guard();
  await createAssignment(reservationId, butlerId, grade);
  done();
}

export async function unassignButler(shiftId: string): Promise<void> {
  await guard();
  await removeAssignment(shiftId);
  done();
}
