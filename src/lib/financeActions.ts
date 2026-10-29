"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureFinanceTables, type ReconcileResult } from "@/lib/finance";
import { homepageUrl } from "@/lib/records";
import { gradePay, isButlerGrade } from "@/lib/financeCalc";

async function guard() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("로그인이 필요합니다.");
  await ensureFinanceTables();
}

const done = () => {
  revalidatePath("/finance");
  revalidatePath("/butlers");
};
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

/** 비용을 실제로 통장에서 지급했다고 기록한다(month = 지급 대상 달 "YYYY-MM"). paid=false면 그 달 기록을 지운다. 날짜를 안 주면 오늘(한국시간). */
export async function setCostPaid(id: string, month: string, paid: boolean, date?: string) {
  await guard();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("대상 월을 확인해 주세요.");
  if (date !== undefined && !isDate(date)) throw new Error("지급일을 확인해 주세요.");
  const cost = await prisma.financeCost.findUnique({ where: { id } });
  if (!cost) throw new Error("비용을 찾을 수 없습니다.");
  let map: Record<string, string> = {};
  try { map = JSON.parse(cost.payments) ?? {}; } catch { /* 깨진 값은 비우고 다시 쓴다 */ }
  if (paid) map[month] = date ?? new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  else delete map[month];
  await prisma.financeCost.update({ where: { id }, data: { payments: JSON.stringify(map) } });
  done();
}

/** 여러 비용을 한 번에(합계로) 지급했다고 기록한다. 같은 지급일이 모두에게 들어간다. */
export async function setCostsPaid(ids: string[], month: string, date: string) {
  await guard();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("대상 월을 확인해 주세요.");
  if (!isDate(date)) throw new Error("지급일을 확인해 주세요.");
  if (!ids.length || ids.length > 500) throw new Error("지급할 비용을 선택해 주세요.");
  const costs = await prisma.financeCost.findMany({ where: { id: { in: ids } } });
  for (const c of costs) {
    let map: Record<string, string> = {};
    try { map = JSON.parse(c.payments) ?? {}; } catch { /* 깨진 값은 비우고 다시 쓴다 */ }
    map[month] = date;
    await prisma.financeCost.update({ where: { id: c.id }, data: { payments: JSON.stringify(map) } });
  }
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

/** 버틀러의 정산 입금 계좌를 저장한다. 비워서 저장하면 지워진다. */
export async function saveButlerAccount(id: string, input: { bankName: string; accountNumber: string; accountHolder: string }) {
  await guard();
  const accountNumber = String(input.accountNumber ?? "").trim();
  if (accountNumber && !/^[0-9-]{6,30}$/.test(accountNumber)) throw new Error("계좌번호는 숫자와 하이픈(-)만 6~30자로 입력해 주세요.");
  await prisma.butler.update({
    where: { id },
    data: { bankName: String(input.bankName ?? "").trim().slice(0, 20), accountNumber, accountHolder: String(input.accountHolder ?? "").trim().slice(0, 30) },
  });
  done();
}

/** 버틀러를 삭제한다. 그 버틀러의 참석·정산 기록도 함께 지워진다(DB 관계 cascade). */
export async function deleteButler(id: string) {
  await guard();
  await prisma.butler.deleteMany({ where: { id } });
  done();
}

/** pay를 비우면 버틀러 등급의 기본 정산금을 쓴다. extra는 스페셜 차지(오너가 추가로 지급하는 돈). */
export async function addShift(input: { butlerId: string; date: string; reservationId: string; grade?: string; pay?: number | null; extra?: number }) {
  await guard();
  if (!isDate(input.date)) throw new Error("참석일을 확인해 주세요.");
  const [butler, reservation] = await Promise.all([
    prisma.butler.findUnique({ where: { id: input.butlerId } }),
    prisma.reservation.findUnique({ where: { id: input.reservationId }, select: { id: true } }),
  ]);
  if (!butler) throw new Error("버틀러를 찾을 수 없습니다.");
  // 등급은 이번 참석마다 정한다. 말하지 않으면 그 버틀러의 기본 등급.
  const grade = input.grade === undefined ? butler.grade : input.grade;
  if (!isButlerGrade(grade)) throw new Error("등급을 확인해 주세요.");
  if (!reservation) throw new Error("예약을 찾을 수 없습니다.");
  await prisma.butlerShift.create({
    data: {
      butlerId: butler.id,
      date: input.date,
      reservationId: reservation.id,
      grade,
      pay: input.pay == null ? gradePay(grade, butler.name) : money(input.pay),
      extra: input.extra ? money(input.extra) : 0,
    },
  });
  done();
}

export async function updateShiftPay(id: string, pay: number) {
  await guard();
  await prisma.butlerShift.updateMany({ where: { id }, data: { pay: money(pay) } });
  done();
}

/** 이 참석 기록의 등급을 바꾸고, 기본 정산금도 새 등급 금액으로 다시 맞춘다. 스페셜 차지는 그대로. */
export async function updateShiftGrade(id: string, grade: string) {
  await guard();
  if (!isButlerGrade(grade)) throw new Error("등급을 확인해 주세요.");
  const shift = await prisma.butlerShift.findUnique({ where: { id }, include: { butler: { select: { name: true } } } });
  if (!shift) return;
  await prisma.butlerShift.update({ where: { id }, data: { grade, pay: gradePay(grade, shift.butler.name) } });
  done();
}

export async function updateShiftExtra(id: string, extra: number) {
  await guard();
  await prisma.butlerShift.updateMany({ where: { id }, data: { extra: money(extra) } });
  done();
}

/** 지급 완료로 처리하고 실제 입금일을 기록한다. 날짜를 안 주면 오늘(한국시간). paid=false면 날짜도 지운다. */
export async function setShiftPaid(id: string, paid: boolean, date?: string) {
  await guard();
  if (date !== undefined && !isDate(date)) throw new Error("입금일을 확인해 주세요.");
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  await prisma.butlerShift.updateMany({ where: { id }, data: { paid: Boolean(paid), paidDate: paid ? date ?? today : "" } });
  done();
}

/** 여러 참석 기록을 한 번에 지급 완료로 기록한다 (비용 탭의 합계로 지급). */
export async function setShiftsPaid(ids: string[], date: string) {
  await guard();
  if (!isDate(date)) throw new Error("지급일을 확인해 주세요.");
  if (!ids.length || ids.length > 500) throw new Error("지급할 정산을 선택해 주세요.");
  await prisma.butlerShift.updateMany({ where: { id: { in: ids } }, data: { paid: true, paidDate: date } });
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

/**
 * 결제 건 대사: 홈페이지가 예약 DB와 포트원 결제 기록을 한 건씩 맞춰 본 결과를 받아,
 * 어드민 예약(결제금액·상태)과도 한 번 더 비교한다. 아무것도 바꾸지 않는 읽기 전용 조회.
 * month = "YYYY-MM" (접수일 기준)
 */
export async function runReconciliation(month: string): Promise<ReconcileResult> {
  await guard();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("월을 확인해 주세요.");
  const apiKey = process.env.RESERVATION_API_KEY;
  if (!apiKey) throw new Error("RESERVATION_API_KEY가 설정되지 않아 홈페이지에 연결할 수 없습니다.");

  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const qs = new URLSearchParams({ from: `${month}-01`, until: `${month}-${String(last).padStart(2, "0")}` });

  let res: Response;
  try {
    res = await fetch(`${homepageUrl()}/api/admin/payment-reconciliation?${qs}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
  } catch {
    throw new Error("홈페이지에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  const data = (await res.json().catch(() => ({}))) as Partial<ReconcileResult> & { code?: string; message?: string };
  if (res.status === 401) throw new Error("홈페이지 연동 키가 맞지 않습니다.");
  if (!res.ok || data.code !== "ok" || !data.rows || !data.summary) throw new Error(data.message ?? `대사 조회에 실패했습니다 (${res.status}).`);

  const adminRows = await prisma.reservation.findMany({
    where: { id: { in: data.rows.map((r) => r.bookingNo) } },
    select: { id: true, status: true, paidAmount: true },
  });
  const admin = new Map(adminRows.map((a) => [a.id, a]));
  let adminPaidTotal = 0;

  const rows = data.rows.map((raw) => {
    const a = admin.get(raw.bookingNo);
    const r = { ...raw, adminPaid: a ? a.paidAmount : null };
    if (a && r.dbStatus === "paid") adminPaidTotal += a.paidAmount;
    // 홈페이지 쪽은 맞는데 어드민과 어긋나는 경우
    if (r.verdict === "ok" && r.dbStatus === "paid") {
      if (!a) return { ...r, verdict: "mismatch" as const, reason: "결제는 확인되는데 어드민에 예약이 없습니다 (연동 누락)" };
      if (a.status !== "취소" && a.paidAmount !== r.pgAmount)
        return { ...r, verdict: "mismatch" as const, reason: `어드민 결제금액(${a.paidAmount.toLocaleString("ko-KR")}원)이 포트원 결제금액(${r.pgAmount.toLocaleString("ko-KR")}원)과 다릅니다` };
    }
    return r;
  });

  return {
    from: data.from ?? qs.get("from")!,
    until: data.until ?? qs.get("until")!,
    summary: { ...data.summary, mismatch: rows.filter((r) => r.verdict === "mismatch").length, ok: rows.filter((r) => r.verdict === "ok").length, adminPaidTotal },
    rows,
    failed: data.failed ?? [],
  };
}
