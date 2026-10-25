import { prisma } from "@/lib/prisma";
import { ensureFinanceTables } from "@/lib/finance";
import { gradePay, isButlerGrade } from "@/lib/financeCalc";

// 예약건에 버틀러를 배정하는 DB 로직. 배정 = 그 예약의 참석·정산 기록(ButlerShift)을 미리 만들어 두는 것이라
// 버틀러 관리의 참석·정산 기록과 손익관리의 비용·통장 잔액 예상에 그대로 들어간다. 별도 테이블은 없다.
// 로그인 확인은 호출하는 서버 액션(assignActions.ts)이 맡는다.

export interface AssignedView {
  shiftId: string;
  butlerId: string;
  name: string;
  grade: string;
  pay: number;
  extra: number;
  paid: boolean;
}

export interface AssignableView {
  id: string;
  name: string;
  /** 새로 배정할 때 처음 보여 줄 등급 */
  grade: string;
  /** 같은 날 다른 예약에 이미 배정돼 있으면 그 예약의 시간(미정이면 빈 문자열) */
  busyAt: string | null;
}

export interface AssignmentView {
  date: string;
  assigned: AssignedView[];
  butlers: AssignableView[];
}

/**
 * 이 예약의 배정 현황과 배정할 수 있는 버틀러 목록.
 * 재협의로 예식일이 바뀌었으면, 아직 지급하지 않은 배정 기록의 참석일을 새 예식일로 맞춘다.
 */
export async function loadAssignment(reservationId: string): Promise<AssignmentView> {
  await ensureFinanceTables();
  const r = await prisma.reservation.findUnique({ where: { id: reservationId }, select: { confirmDate: true } });
  if (!r) throw new Error("예약을 찾을 수 없습니다.");
  const date = r.confirmDate;

  if (date) await prisma.butlerShift.updateMany({ where: { reservationId, paid: false, NOT: { date } }, data: { date } });

  const [shifts, butlers, sameDay] = await Promise.all([
    prisma.butlerShift.findMany({ where: { reservationId }, include: { butler: true }, orderBy: { createdAt: "asc" } }),
    prisma.butler.findMany({ orderBy: { createdAt: "asc" } }),
    date ? prisma.butlerShift.findMany({ where: { date, NOT: { reservationId } } }) : Promise.resolve([]),
  ]);
  const others = sameDay.length
    ? await prisma.reservation.findMany({ where: { id: { in: Array.from(new Set(sameDay.map((s) => s.reservationId))) }, status: { not: "취소" } }, select: { id: true, confirmTime: true } })
    : [];
  const timeOf = new Map(others.map((o) => [o.id, o.confirmTime]));
  const busy = new Map<string, string>();
  for (const s of sameDay) if (timeOf.has(s.reservationId)) busy.set(s.butlerId, timeOf.get(s.reservationId) ?? "");

  return {
    date,
    assigned: shifts.map((s) => ({ shiftId: s.id, butlerId: s.butlerId, name: s.butler.name, grade: s.grade, pay: s.pay, extra: s.extra, paid: s.paid })),
    butlers: butlers.map((b) => ({ id: b.id, name: b.name, grade: b.grade, busyAt: busy.has(b.id) ? busy.get(b.id)! : null })),
  };
}

/** 버틀러를 예약에 배정한다. 참석일은 예약의 예식일, 기본 정산금은 고른 등급의 금액. */
export async function createAssignment(reservationId: string, butlerId: string, grade: string): Promise<void> {
  await ensureFinanceTables();
  if (!isButlerGrade(grade)) throw new Error("등급을 확인해 주세요.");
  const [r, butler, existing] = await Promise.all([
    prisma.reservation.findUnique({ where: { id: reservationId }, select: { id: true, status: true, confirmDate: true } }),
    prisma.butler.findUnique({ where: { id: butlerId } }),
    prisma.butlerShift.findFirst({ where: { reservationId, butlerId } }),
  ]);
  if (!r) throw new Error("예약을 찾을 수 없습니다.");
  if (r.status === "취소") throw new Error("취소된 예약에는 배정할 수 없습니다.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.confirmDate)) throw new Error("예식 날짜가 정해진 뒤에 배정할 수 있습니다.");
  if (!butler) throw new Error("버틀러를 찾을 수 없습니다.");
  if (existing) throw new Error(`${butler.name} 님은 이미 이 예약에 배정되어 있습니다.`);
  await prisma.butlerShift.create({ data: { butlerId, reservationId, date: r.confirmDate, grade, pay: gradePay(grade, butler.name) } });
}

/** 배정을 해제한다. 이미 지급 완료로 표시된 기록은 버틀러 관리에서 직접 처리해야 한다. */
export async function removeAssignment(shiftId: string): Promise<void> {
  await ensureFinanceTables();
  const { count } = await prisma.butlerShift.deleteMany({ where: { id: shiftId, paid: false } });
  if (!count) throw new Error("이미 지급 완료된 기록이라 여기서 해제할 수 없습니다. 버틀러 관리에서 처리해 주세요.");
}
