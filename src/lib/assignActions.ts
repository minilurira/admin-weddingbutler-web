"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyButlerShift } from "@/lib/butlerNotice";
import { changeAssignmentSide, createAssignment, loadAssignment, removeAssignment, type AssignmentView } from "@/lib/assign";

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

/** 배정하고, 예식이 이번 달이면 그 버틀러에게 업무 배정 알림톡을 바로 보낸다(다음 달 이후 예식은 그 달 1일 크론이 보낸다).
 * 화면에 띄울 결과 문구를 돌려준다. */
export async function assignButler(reservationId: string, butlerId: string, grade: string, side = ""): Promise<string> {
  await guard();
  await createAssignment(reservationId, butlerId, grade, side);
  done();
  const shift = await prisma.butlerShift.findFirst({ where: { reservationId, butlerId }, select: { id: true } });
  if (!shift) return "배정했습니다.";
  const res = await notifyButlerShift(shift.id);
  if (res.sent) return "배정하고 버틀러에게 업무 배정 알림톡을 보냈습니다.";
  if (res.detail.endsWith("발송 예정")) return `배정했습니다. 버틀러 알림톡은 ${res.detail}입니다.`;
  if (res.detail === "지난 예식" || res.detail === "이미 보냄") return "배정했습니다.";
  return `배정했지만 버틀러 알림톡은 보내지 못했습니다 (${res.detail}).`;
}

/** 배정된 버틀러가 맡을 쪽(신랑측/신부측/양가 통합)을 바꾼다. */
export async function setAssignmentSide(shiftId: string, side: string): Promise<void> {
  await guard();
  await changeAssignmentSide(shiftId, side);
  done();
}

export async function unassignButler(shiftId: string): Promise<void> {
  await guard();
  await removeAssignment(shiftId);
  done();
}
