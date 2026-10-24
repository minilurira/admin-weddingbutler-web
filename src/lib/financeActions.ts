"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureFinanceTables } from "@/lib/finance";

async function guard() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("로그인이 필요합니다.");
  await ensureFinanceTables();
}

const done = () => revalidatePath("/finance");
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const money = (v: unknown) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 2_000_000_000) throw new Error("금액을 확인해 주세요.");
  return n;
};
const text = (v: unknown, label: string, max = 80) => {
  const t = String(v ?? "").trim();
  if (!t) throw new Error(`${label}을(를) 입력해 주세요.`);
  return t.slice(0, max);
};

export async function addCost(input: { name: string; amount: number; kind: string; date: string; memo: string }) {
  await guard();
  if (input.kind !== "once" && input.kind !== "monthly") throw new Error("구분을 확인해 주세요.");
  if (!isDate(input.date)) throw new Error("날짜를 확인해 주세요.");
  await prisma.financeCost.create({
    data: { name: text(input.name, "항목"), amount: money(input.amount), kind: input.kind, date: input.date, memo: String(input.memo ?? "").trim().slice(0, 200) },
  });
  done();
}

export async function deleteCost(id: string) {
  await guard();
  await prisma.financeCost.deleteMany({ where: { id } });
  done();
}

export async function addButler(name: string) {
  await guard();
  await prisma.butler.create({ data: { name: text(name, "이름", 30) } });
  done();
}

export async function addShift(input: { butlerId: string; date: string; reservationId: string; pay: number }) {
  await guard();
  if (!isDate(input.date)) throw new Error("참석일을 확인해 주세요.");
  const [butler, reservation] = await Promise.all([
    prisma.butler.findUnique({ where: { id: input.butlerId } }),
    prisma.reservation.findUnique({ where: { id: input.reservationId }, select: { id: true } }),
  ]);
  if (!butler) throw new Error("버틀러를 찾을 수 없습니다.");
  if (!reservation) throw new Error("예약을 찾을 수 없습니다.");
  await prisma.butlerShift.create({
    data: { butlerId: butler.id, date: input.date, reservationId: reservation.id, pay: money(input.pay) },
  });
  done();
}

export async function updateShiftPay(id: string, pay: number) {
  await guard();
  await prisma.butlerShift.updateMany({ where: { id }, data: { pay: money(pay) } });
  done();
}

export async function setShiftPaid(id: string, paid: boolean) {
  await guard();
  await prisma.butlerShift.updateMany({ where: { id }, data: { paid: Boolean(paid) } });
  done();
}

export async function deleteShift(id: string) {
  await guard();
  await prisma.butlerShift.deleteMany({ where: { id } });
  done();
}

/** amount가 null이면 입력을 지워 "미입력" 상태로 되돌린다. */
export async function setCash(reservationId: string, amount: number | null) {
  await guard();
  if (amount === null) await prisma.financeCash.deleteMany({ where: { reservationId } });
  else await prisma.financeCash.upsert({ where: { reservationId }, create: { reservationId, amount: money(amount) }, update: { amount: money(amount) } });
  done();
}

export async function saveSettings(input: { feeRate?: number; bankDate?: string; bankBalance?: number }) {
  await guard();
  const rows: { key: string; value: string }[] = [];
  if (input.feeRate !== undefined) {
    const f = Number(input.feeRate);
    if (!Number.isFinite(f) || f < 0 || f > 20) throw new Error("수수료율은 0~20% 사이로 입력해 주세요.");
    rows.push({ key: "feeRate", value: String(f) });
  }
  if (input.bankDate !== undefined) {
    if (!isDate(input.bankDate)) throw new Error("기준일을 확인해 주세요.");
    rows.push({ key: "bankDate", value: input.bankDate });
  }
  if (input.bankBalance !== undefined) {
    const b = Math.round(Number(input.bankBalance));
    if (!Number.isFinite(b) || Math.abs(b) > 100_000_000_000) throw new Error("잔액을 확인해 주세요.");
    rows.push({ key: "bankBalance", value: String(b) });
  }
  for (const r of rows) await prisma.financeSetting.upsert({ where: { key: r.key }, create: r, update: { value: r.value } });
  done();
}
