"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendButlerAssignedAlimtalk } from "@/lib/alimtalk";
import { ensureMessageLogTable } from "@/lib/messageLog";
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

/** 배정하고, 아직 배정 알림톡을 보낸 적이 없으면 고객에게 보낸다. 화면에 띄울 결과 문구를 돌려준다. */
export async function assignButler(reservationId: string, butlerId: string, grade: string, side = ""): Promise<string> {
  await guard();
  await createAssignment(reservationId, butlerId, grade, side);
  done();
  const r = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!r || r.status === "취소") return "배정했습니다.";
  // 배정 알림톡은 예약당 한 번만 보낸다. 발송 이력(발송 내역)에 성공 기록이 있으면 해제 후 재배정이나 추가 배정에도 다시 보내지 않는다.
  // 첫 발송이 실패했다면 성공 기록이 없으므로 다음 배정 때 다시 시도한다.
  await ensureMessageLogTable();
  const already = await prisma.messageLog.findFirst({ where: { reservationId, kind: "버틀러 배정", status: "sent" }, select: { id: true } });
  if (already) return "배정했습니다. (배정 알림톡은 이미 보냈습니다)";
  const res = await sendButlerAssignedAlimtalk(r);
  return res.sent ? "배정하고 고객에게 배정 알림톡을 보냈습니다." : `배정했지만 알림톡은 보내지 못했습니다 (${res.detail}).`;
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
