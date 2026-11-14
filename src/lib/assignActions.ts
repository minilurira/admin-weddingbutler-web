"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyReservationButlers } from "@/lib/butlerNotice";
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

/** 배정하고 그 버틀러에게 업무 배정 알림톡을 바로 보낸다(다음 달 이후 예식이면 예식 달 1일 크론이 한 번 더 보낸다).
 * 화면에 띄울 결과 문구를 돌려준다. */
export async function assignButler(reservationId: string, butlerId: string, grade: string, side = ""): Promise<string> {
  await guard();
  await createAssignment(reservationId, butlerId, grade, side);
  done();
  const shift = await prisma.butlerShift.findFirst({ where: { reservationId, butlerId }, select: { id: true, grade: true } });
  if (!shift) return "배정했습니다.";
  // 오너가 배정되면 먼저 배정돼 기다리던 스태프에게도 이때 나가므로 예약의 배정 전원을 확인한다
  const results = await notifyReservationButlers(reservationId);
  const sent = results.filter((x) => x.sent).length;
  const res = results.find((x) => x.shiftId === shift.id);
  if (sent) return `배정했습니다. 버틀러 ${sent}명에게 업무 배정 알림톡을 보냈습니다.`;
  if (!res || shift.grade === "owner" || ["지난 예식", "이미 보냄"].includes(res.detail)) return "배정했습니다.";
  if (res.detail.endsWith("후 발송")) return `배정했습니다. 버틀러 알림톡은 ${res.detail}입니다.`;
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
