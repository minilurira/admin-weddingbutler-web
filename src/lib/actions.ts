"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcConfirm } from "@/lib/pricing";
import { sendConfirmAlimtalk } from "@/lib/alimtalk";

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("로그인이 필요합니다.");
  return session;
}

function revalidateAll() {
  revalidatePath("/reservations");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
}

export interface ConfirmFieldsInput {
  date: string;
  time: string;
  venue: string;
  butlers: number;
  extraGuests: number;
  discount: number;
  hours: string;
  note: string;
}

export async function saveConfirmFields(id: string, fields: ConfirmFieldsInput) {
  await requireSession();
  await prisma.reservation.update({
    where: { id },
    data: {
      confirmDate: fields.date,
      confirmTime: fields.time,
      confirmVenue: fields.venue,
      confirmButlers: fields.butlers,
      confirmExtraGuests: fields.extraGuests,
      confirmDiscount: fields.discount,
      confirmHours: fields.hours,
      confirmNote: fields.note,
    },
  });
  revalidateAll();
}

export async function confirmReservation(id: string, fields: ConfirmFieldsInput) {
  await requireSession();
  const existing = await prisma.reservation.findUniqueOrThrow({ where: { id } });
  const wasConfirmed = existing.status === "확정";

  const updated = await prisma.reservation.update({
    where: { id },
    data: {
      status: "확정",
      confirmDate: fields.date,
      confirmTime: fields.time,
      confirmVenue: fields.venue,
      confirmButlers: fields.butlers,
      confirmExtraGuests: fields.extraGuests,
      confirmDiscount: fields.discount,
      confirmHours: fields.hours,
      confirmNote: fields.note,
    },
  });

  const price = calcConfirm({ plan: updated.confirmPlan, butlers: updated.confirmButlers, extraGuests: updated.confirmExtraGuests, discount: updated.confirmDiscount });
  const result = await sendConfirmAlimtalk({
    reservationId: updated.id,
    customer: updated.customer,
    phone: updated.phone,
    venue: updated.confirmVenue,
    date: updated.confirmDate,
    time: updated.confirmTime,
    amount: price.total,
  });
  await prisma.reservation.update({ where: { id }, data: { alimtalkAt: new Date() } });

  revalidateAll();
  return {
    message: wasConfirmed
      ? "확정 내용이 저장되었습니다."
      : `${updated.customer} 님 예약이 확정되어 캘린더에 등록되었습니다.`,
    alimtalk: result,
  };
}

export async function holdReservation(id: string) {
  await requireSession();
  const updated = await prisma.reservation.update({ where: { id }, data: { status: "협의중" } });
  revalidateAll();
  return { message: "협의 중 상태로 변경했습니다.", id: updated.id };
}

export async function addNote(id: string, text: string) {
  await requireSession();
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, message: "협의 내용을 입력해 주세요." };

  const existing = await prisma.reservation.findUniqueOrThrow({ where: { id } });
  await prisma.note.create({ data: { reservationId: id, text: trimmed } });
  if (existing.status === "신규요청") {
    await prisma.reservation.update({ where: { id }, data: { status: "협의중" } });
  }
  revalidateAll();
  return { ok: true, message: "고객 요청 기록이 추가되었습니다." };
}

export interface NewReservationInput {
  customer: string;
  couple: string;
  phone: string;
  wishDateLabel: string;
  venueLabel: string;
  guestsLabel: string;
  memo: string;
  requestedPlan: string;
}

function generateId() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `WB-${datePart}-${suffix}`;
}

export async function createReservation(input: NewReservationInput) {
  await requireSession();
  const id = generateId();
  const now = new Date();
  await prisma.reservation.create({
    data: {
      id,
      customer: input.customer,
      couple: input.couple,
      phone: input.phone,
      requestedAt: now,
      wishDateLabel: input.wishDateLabel,
      venueLabel: input.venueLabel,
      guestsLabel: input.guestsLabel,
      memo: input.memo,
      status: "신규요청",
      requestedPlan: input.requestedPlan,
      confirmPlan: input.requestedPlan,
      confirmDate: now.toISOString().slice(0, 10),
      confirmTime: "12:00",
      confirmVenue: input.venueLabel,
      confirmButlers: 2,
      confirmExtraGuests: 0,
      confirmDiscount: 0,
      confirmHours: "",
      confirmNote: "",
    },
  });
  revalidateAll();
  return { id };
}

export async function resendAlimtalk(id: string) {
  await requireSession();
  const r = await prisma.reservation.findUniqueOrThrow({ where: { id } });
  const price = calcConfirm({ plan: r.confirmPlan, butlers: r.confirmButlers, extraGuests: r.confirmExtraGuests, discount: r.confirmDiscount });
  const result = await sendConfirmAlimtalk({
    reservationId: r.id, customer: r.customer, phone: r.phone,
    venue: r.confirmVenue, date: r.confirmDate, time: r.confirmTime, amount: price.total,
  });
  await prisma.reservation.update({ where: { id }, data: { alimtalkAt: new Date() } });
  revalidateAll();
  return { message: result.sent ? "확정 알림톡을 재발송했습니다." : `확정 알림톡 재발송 요청을 기록했습니다 (${result.detail}).` };
}
