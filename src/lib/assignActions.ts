"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendButlerAssignedAlimtalk } from "@/lib/alimtalk";
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

/** 배정하고, 최초 1명이 배정되면 고객에게 배정 알림톡을 보낸다. 화면에 띄울 결과 문구를 돌려준다. */
export async function assignButler(reservationId: string, butlerId: string, grade: string): Promise<string> {
  await guard();
  await createAssignment(reservationId, butlerId, grade);
  done();
  const r = await prisma.reservation.findUnique({ where: { id: reservationId } });
  const shifts = await prisma.butlerShift.findMany({ where: { reservationId }, include: { butler: true }, orderBy: { createdAt: "asc" } });
  // 알림톡은 최초 1명이 배정될 때만 보낸다. 두 번째 이후 배정과 해제 후 재배정(명단이 다시 1명이 되는 경우)은 안내하지 않는다.
  if (!r || r.status === "취소" || shifts.length !== 1) return "배정했습니다.";
  const res = await sendButlerAssignedAlimtalk(r, shifts.map((s) => s.butler.name));
  return res.sent ? "배정하고 고객에게 배정 알림톡을 보냈습니다." : `배정했지만 알림톡은 보내지 못했습니다 (${res.detail}).`;
}

export async function unassignButler(shiftId: string): Promise<void> {
  await guard();
  await removeAssignment(shiftId);
  done();
}
