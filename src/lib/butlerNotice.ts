import { prisma } from "@/lib/prisma";
import { ensureFinanceTables } from "@/lib/finance";
import { ensureMessageLogTable } from "@/lib/messageLog";
import { sendButlerStaffAlimtalk } from "@/lib/alimtalk";
import { pad2 } from "@/lib/format";
import { won } from "@/lib/pricing";

// 버틀러(스태프) 업무 배정 알림톡을 언제 보낼지 정한다 (2026-11-13 루리님 규칙).
// - 예식이 이번 달(한국 날짜 기준)인 배정만 보낸다. 이번 달 예식에 배정하면 배정할 때 바로 보낸다.
// - 다음 달 이후 예식은 그 달 1일 10:00 크론(/api/cron/butler-notices)이 한꺼번에 보낸다.
// - 오너 버틀러에게는 보내지 않는다. 스태프·매니저에게는 그 예약에 오너 버틀러가 배정된 뒤에만 보낸다(2026-11-14).
// - 버틀러 한 명에게 예약 하나당 한 번만: 발송 내역(MessageLog)에 그 버틀러의 성공 기록이 있으면 다시 보내지 않는다.
//   실패한 건은 성공 기록이 없으니 다음 크론 때 다시 시도한다.

const KIND = "버틀러 업무 배정";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 한국 날짜 "YYYY-MM-DD" */
export function kstToday(now = new Date()): string {
  const k = new Date(now.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}-${pad2(k.getUTCMonth() + 1)}-${pad2(k.getUTCDate())}`;
}

/** 이번 달 남은 예식이면 true (오늘 포함, 지난 예식은 보내지 않는다) */
export function isThisMonthUpcoming(date: string, today = kstToday()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date.slice(0, 7) === today.slice(0, 7) && date >= today;
}

/** 아이템 항목 값은 23자를 넘으면 카카오가 거절한다(3076) */
const cut = (v: string, fallback = "추후 안내") => {
  const s = v.trim() || fallback;
  return s.length <= 23 ? s : s.slice(0, 22) + "…";
};

function weddingDateLabel(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}.${pad2(m)}.${pad2(d)} (${wd}) ${/^\d{1,2}:\d{2}$/.test(time) ? time : "시간 미정"}`;
}

/** 근무 시작 = 예식 1시간 전 */
function workStartLabel(time: string): string {
  const m = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "추후 안내";
  const at = Math.max(0, Number(m[1]) * 60 + Number(m[2]) - 60);
  return `${pad2(Math.floor(at / 60))}:${pad2(at % 60)}`;
}

/** 담당: "신랑측 (박준호)" / "신부측 (이서연)" / "양가 통합". 양가 예약의 이름은 "신랑 · 신부" 순서로 저장돼 있다. */
function deskSideLabel(shiftSide: string, reservationSide: string, couple: string): string {
  const side = shiftSide || (reservationSide === "신랑측" || reservationSide === "신부측" ? reservationSide : "");
  if (!side) return "추후 안내";
  if (side !== "신랑측" && side !== "신부측") return side;
  // "박준호 · 이서연" 처럼 구분자가 있으면 그걸로, 없고 "윤지호 유연지"처럼 띄어쓰기로 두 이름이면 띄어쓰기로 나눈다
  let names = couple.split(/\s*[·,/&]\s*/).map((s) => s.trim()).filter(Boolean);
  if (names.length === 1 && names[0].split(/\s+/).length === 2) names = names[0].split(/\s+/);
  const name = names.length >= 2 ? names[side === "신랑측" ? 0 : 1] : names[0] ?? "";
  return cut(name ? `${side} (${name})` : side);
}

/** 같은 쪽을 함께 맡은 동료 이름 (본인 제외): "김준수 (본인 포함 2명)". 혼자면 "본인 1명". */
function teamLabel(coworkers: string[]): string {
  if (!coworkers.length) return "본인 1명";
  const count = `(본인 포함 ${coworkers.length + 1}명)`;
  const full = `${coworkers.join(", ")} ${count}`;
  return full.length <= 23 ? full : `본인 포함 ${coworkers.length + 1}명`;
}

/** 배정 기록 하나에 대해, 보낼 때가 됐고 아직 안 보냈으면 그 버틀러에게 보낸다. 화면·크론에 보여 줄 결과 문구를 돌려준다. */
export async function notifyButlerShift(shiftId: string, today = kstToday()): Promise<{ sent: boolean; detail: string }> {
  await ensureFinanceTables();
  const shift = await prisma.butlerShift.findUnique({ where: { id: shiftId }, include: { butler: true } });
  if (!shift) return { sent: false, detail: "배정 없음" };
  const r = await prisma.reservation.findUnique({ where: { id: shift.reservationId } });
  if (!r || r.status === "취소") return { sent: false, detail: "취소된 예약" };
  const date = r.confirmDate || shift.date;
  if (!isThisMonthUpcoming(date, today)) {
    return { sent: false, detail: date > today ? `${Number(date.slice(5, 7))}월 1일 발송 예정` : "지난 예식" };
  }
  if (shift.grade === "owner") return { sent: false, detail: "오너 버틀러" };
  const hasOwner = await prisma.butlerShift.count({ where: { reservationId: r.id, grade: "owner" } });
  if (!hasOwner) return { sent: false, detail: "오너 버틀러 배정 후 발송" };
  if (!shift.butler.phone) return { sent: false, detail: "휴대폰 번호 미등록" };

  await ensureMessageLogTable();
  const already = await prisma.messageLog.findFirst({
    where: { reservationId: r.id, kind: KIND, status: "sent", variables: { contains: `"_butlerId":"${shift.butlerId}"` } },
    select: { id: true },
  });
  if (already) return { sent: false, detail: "이미 보냄" };

  const team = await prisma.butlerShift.findMany({ where: { reservationId: r.id }, include: { butler: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
  const couple = r.couple || r.customer;
  const sideOf = (v: string) => v || (r.side === "신랑측" || r.side === "신부측" ? r.side : "");
  const variables = {
    "#{weddingDate}": weddingDateLabel(date, r.confirmTime),
    "#{venue}": cut(r.confirmVenue || r.venueLabel),
    "#{couple}": cut(couple),
    "#{workStart}": workStartLabel(r.confirmTime),
    "#{deskSide}": deskSideLabel(shift.side, r.side, couple),
    // 같은 쪽(신랑측/신부측/양가 통합)을 맡은 동료만. 한측 예약은 쪽을 고르지 않으므로(이전 배정은 빈 값) 예약의 쪽으로 본다
    "#{team}": teamLabel(team.filter((t) => t.id !== shift.id && sideOf(t.side) === sideOf(shift.side)).map((t) => t.butler.name)),
    "#{pay}": won(shift.pay + shift.extra),
  };
  return sendButlerStaffAlimtalk(r.id, shift.butlerId, shift.butler.phone, variables);
}

/** 이번 달 남은 예식의 배정 중 아직 안 보낸 것을 모두 보낸다 (크론용). */
export async function notifyThisMonthButlers(today = kstToday()): Promise<string[]> {
  await ensureFinanceTables();
  const monthEnd = `${today.slice(0, 7)}-31`;
  const shifts = await prisma.butlerShift.findMany({ where: { date: { gte: today, lte: monthEnd } }, include: { butler: { select: { name: true } } }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] });
  const lines: string[] = [];
  for (const s of shifts) {
    const res = await notifyButlerShift(s.id, today);
    // 보냈거나 실패한 건만 알린다 (번호 미등록·이미 보냄은 매일 반복되므로 빼고, 배정 화면에서 확인한다)
    if (res.sent || !["이미 보냄", "휴대폰 번호 미등록", "지난 예식", "취소된 예약", "오너 버틀러", "오너 버틀러 배정 후 발송"].includes(res.detail)) lines.push(`${s.date} ${s.reservationId} ${s.butler.name} · ${res.sent ? "전송 완료" : res.detail}`);
  }
  return lines;
}

/** 한 예약의 배정 버틀러 모두에게 보낼 때가 됐으면 보낸다 (오너가 나중에 배정되면 먼저 배정된 스태프에게도 이때 나간다). */
export async function notifyReservationButlers(reservationId: string): Promise<{ shiftId: string; sent: boolean; detail: string }[]> {
  await ensureFinanceTables();
  const shifts = await prisma.butlerShift.findMany({ where: { reservationId }, select: { id: true }, orderBy: { createdAt: "asc" } });
  const out: { shiftId: string; sent: boolean; detail: string }[] = [];
  for (const s of shifts) out.push({ shiftId: s.id, ...(await notifyButlerShift(s.id)) });
  return out;
}
