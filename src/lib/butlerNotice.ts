import { prisma } from "@/lib/prisma";
import { ensureFinanceTables } from "@/lib/finance";
import { ensureMessageLogTable } from "@/lib/messageLog";
import { sendButlerCancelAlimtalk, sendButlerDayBeforeAlimtalk, sendButlerStaffAlimtalk } from "@/lib/alimtalk";
import { pad2 } from "@/lib/format";
import { won } from "@/lib/pricing";

// 버틀러(스태프) 업무 배정 알림톡을 언제 보낼지 정한다 (2026-11-14 루리님 규칙, 날짜는 한국 기준).
// - 배정할 때(mode "assign"): 지나지 않은 예식이면 예식 달과 상관없이 바로 한 번 보낸다.
// - 예식 달 1일 10:00 크론(mode "month", /api/cron/butler-notices): 그 달 예식인데 그 달 안에 받은 적이 없는 버틀러에게 한 번 더 보낸다.
//   그래서 이번 달 예식에 이번 달 배정한 사람은 한 번만, 다음 달 이후 예식은 배정 때 + 예식 달 1일 두 번 받는다. 1일 전에 해제하면 1일에는 안 받는다.
// - 오너 버틀러에게는 보내지 않는다. 스태프·매니저에게는 그 예약에 오너 버틀러가 배정된 뒤에만 보낸다(2026-11-14).
// - 중복 방지는 발송 내역(MessageLog)의 그 버틀러 성공 기록으로 한다 (assign: 기록이 하나라도 있으면, month: 이번 달 기록이 있으면 안 보냄).

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
export const cut = (v: string, fallback = "추후 안내") => {
  const s = v.trim() || fallback;
  return s.length <= 23 ? s : s.slice(0, 22) + "…";
};

export function weddingDateLabel(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}.${pad2(m)}.${pad2(d)} (${wd}) ${/^\d{1,2}:\d{2}$/.test(time) ? time : "시간 미정"}`;
}

/** 근무 시작 = 예식 1시간 전 */
export function workStartLabel(time: string): string {
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

/** 버틀러팀: 이 예약에 배정된 버틀러 전원(본인 포함). 23자를 넘으면 "이강, 최소연 외 3명"처럼 줄인다. */
function teamLabel(names: string[]): string {
  const full = names.join(", ");
  if (full.length <= 23) return full || "추후 안내";
  for (let n = names.length - 1; n >= 1; n--) {
    const short = `${names.slice(0, n).join(", ")} 외 ${names.length - n}명`;
    if (short.length <= 23) return short;
  }
  return `총 ${names.length}명`;
}

/** 배정 기록 하나에 대해, 보낼 때가 됐고 아직 안 보냈으면 그 버틀러에게 보낸다. 화면·크론에 보여 줄 결과 문구를 돌려준다. */
export async function notifyButlerShift(shiftId: string, mode: "assign" | "month" = "assign", today = kstToday()): Promise<{ sent: boolean; detail: string }> {
  await ensureFinanceTables();
  const shift = await prisma.butlerShift.findUnique({ where: { id: shiftId }, include: { butler: true } });
  if (!shift) return { sent: false, detail: "배정 없음" };
  const r = await prisma.reservation.findUnique({ where: { id: shift.reservationId } });
  if (!r || r.status === "취소") return { sent: false, detail: "취소된 예약" };
  const date = r.confirmDate || shift.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) return { sent: false, detail: "지난 예식" };
  if (mode === "month" && !isThisMonthUpcoming(date, today)) return { sent: false, detail: "이번 달 예식 아님" };
  if (shift.grade === "owner") return { sent: false, detail: "오너 버틀러" };
  const hasOwner = await prisma.butlerShift.count({ where: { reservationId: r.id, grade: "owner" } });
  if (!hasOwner) return { sent: false, detail: "오너 버틀러 배정 후 발송" };
  if (!shift.butler.phone) return { sent: false, detail: "휴대폰 번호 미등록" };

  await ensureMessageLogTable();
  const already = await prisma.messageLog.findFirst({
    where: {
      reservationId: r.id, kind: KIND, status: "sent", variables: { contains: `"_butlerId":"${shift.butlerId}"` },
      // 1일 발송은 이번 달(한국 1일 0시 이후)에 받은 기록이 있을 때만 건너뛴다
      ...(mode === "month" ? { createdAt: { gte: new Date(`${today.slice(0, 7)}-01T00:00:00+09:00`) } } : {}),
    },
    select: { id: true },
  });
  if (already) return { sent: false, detail: "이미 보냄" };

  const team = await prisma.butlerShift.findMany({ where: { reservationId: r.id }, include: { butler: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
  const couple = r.couple || r.customer;
  const variables = {
    "#{weddingDate}": weddingDateLabel(date, r.confirmTime),
    "#{venue}": cut(r.confirmVenue || r.venueLabel),
    "#{couple}": cut(couple),
    "#{workStart}": workStartLabel(r.confirmTime),
    "#{deskSide}": deskSideLabel(shift.side, r.side, couple),
    // 버틀러팀: 보내는 시점에 이 예약에 배정된 버틀러 전원(본인 포함, 2026-11-14 루리님 요청)
    "#{team}": teamLabel(team.map((t) => t.butler.name)),
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
    const res = await notifyButlerShift(s.id, "month", today);
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
  for (const s of shifts) out.push({ shiftId: s.id, ...(await notifyButlerShift(s.id, "assign")) });
  return out;
}

/** 배정이 해제된 버틀러에게 배정 취소 알림톡을 보낸다. 해제하기 전에 읽어 둔 배정 정보(shift)를 받는다.
 * 보내는 경우: 지나지 않은 예식이고, 휴대폰 번호가 있고, 오너가 아니고, 그 버틀러가 업무 배정 알림톡을 이미 받았을 때(받은 적 없으면 취소를 알릴 필요가 없다).
 * 화면에 띄울 결과 문구를 돌려준다(보내지 않았으면 빈 문자열). */
export async function notifyButlerUnassigned(shift: { reservationId: string; butlerId: string; grade: string; date: string }, today = kstToday(), reservationCancelled = false): Promise<string> {
  if (shift.grade === "owner") return "";
  const [r, butler] = await Promise.all([
    prisma.reservation.findUnique({ where: { id: shift.reservationId } }),
    prisma.butler.findUnique({ where: { id: shift.butlerId } }),
  ]);
  if (!r || !butler || (r.status === "취소" && !reservationCancelled)) return "";
  const date = r.confirmDate || shift.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) return "";
  if (!butler.phone) return "";
  await ensureMessageLogTable();
  const told = await prisma.messageLog.findFirst({ where: { reservationId: r.id, kind: KIND, status: "sent", variables: { contains: `"_butlerId":"${butler.id}"` } }, select: { id: true } });
  if (!told) return "";
  const weddingDate = weddingDateLabel(date, r.confirmTime);
  const venue = cut(r.confirmVenue || r.venueLabel);
  const text = [
    "[웨딩버틀러] 배정 취소 안내",
    "",
    `${butler.name} 버틀러님, 아래 예식의 배정이 취소되었습니다.`,
    "",
    `일시: ${weddingDate}`,
    `장소: ${venue}`,
    "",
    "해당 예식에는 참석하지 않으셔도 됩니다. 문의사항은 웨딩버틀러로 연락해 주세요.",
  ].join("\n");
  const res = await sendButlerCancelAlimtalk(r.id, butler.id, butler.phone, { "#{name}": butler.name, "#{weddingDate}": weddingDate, "#{venue}": venue }, text);
  return res.sent ? `${butler.name} 님에게 배정 취소 알림을 보냈습니다.` : `배정 취소 알림은 보내지 못했습니다 (${res.detail}).`;
}

/** 예약이 취소됐을 때, 그 예약에 배정된 버틀러 모두에게 배정 취소 알림톡을 보낸다(보내는 조건은 notifyButlerUnassigned와 같다). 배정 기록 자체는 그대로 둔다. */
export async function notifyReservationCancelledButlers(reservationId: string): Promise<string[]> {
  await ensureFinanceTables();
  const shifts = await prisma.butlerShift.findMany({ where: { reservationId }, select: { reservationId: true, butlerId: true, grade: true, date: true }, orderBy: { createdAt: "asc" } });
  const out: string[] = [];
  for (const s of shifts) {
    const msg = await notifyButlerUnassigned(s, kstToday(), true).catch((e) => { console.error("[cancel] butler notice failed", e); return "배정 취소 알림은 보내지 못했습니다."; });
    if (msg) out.push(msg);
  }
  return out;
}

/** "YYYY-MM-DD" 다음 날 */
export function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** 내일 예식에 배정된 버틀러 모두(오너 포함)에게 업무 1일 전 안내를 보낸다 (크론 /api/cron/butler-day-before).
 * 확정 예약만, 같은 예식 일시로 이미 받은 버틀러는 건너뛴다(예식 일시가 바뀌면 다시 보낸다). 결과 줄을 돌려준다. */
export async function notifyTomorrowButlers(today = kstToday()): Promise<string[]> {
  await ensureFinanceTables();
  await ensureMessageLogTable();
  const date = nextDay(today);
  const reservations = await prisma.reservation.findMany({ where: { status: "확정", confirmDate: date } });
  const lines: string[] = [];
  for (const r of reservations) {
    const shifts = await prisma.butlerShift.findMany({ where: { reservationId: r.id }, include: { butler: true }, orderBy: { createdAt: "asc" } });
    const team = teamLabel(shifts.map((s) => s.butler.name));
    for (const s of shifts) {
      const weddingDate = weddingDateLabel(date, r.confirmTime);
      const already = await prisma.messageLog.findFirst({
        where: { reservationId: r.id, kind: "버틀러 1일 전 안내", status: "sent", AND: [{ variables: { contains: `"_butlerId":"${s.butlerId}"` } }, { variables: { contains: weddingDate } }] },
        select: { id: true },
      });
      if (already) continue;
      if (!s.butler.phone) { lines.push(`${r.id} ${s.butler.name} · 휴대폰 번호 미등록`); continue; }
      const couple = r.couple || r.customer;
      const start = workStartLabel(r.confirmTime);
      const variables = {
        "#{name}": s.butler.name,
        "#{weddingDate}": weddingDate,
        "#{venue}": cut(r.confirmVenue || r.venueLabel),
        "#{couple}": cut(couple),
        "#{deskSide}": deskSideLabel(s.side, r.side, couple),
        "#{workStart}": start === "추후 안내" ? start : `${start}까지`, // 예식 1시간 전까지 도착
        "#{team}": team,
      };
      const text = [
        "[웨딩버틀러] 내일 업무 안내",
        "",
        `${s.butler.name} 버틀러님, 내일 배정된 예식 업무를 안내드립니다.`,
        "",
        `일시: ${weddingDate}`,
        `장소: ${variables["#{venue}"]}`,
        `신랑신부: ${variables["#{couple}"]}`,
        `담당: ${variables["#{deskSide}"]}`,
        `도착 시각: ${variables["#{workStart}"]}`,
        `버틀러팀: ${team}`,
        "",
        "예식 1시간 전까지 도착해 주세요. 참석이 어려우면 바로 웨딩버틀러로 연락해 주세요.",
      ].join("\n");
      const res = await sendButlerDayBeforeAlimtalk(r.id, s.butlerId, s.butler.phone, variables, text);
      lines.push(`${r.id} ${s.butler.name} · ${res.detail}`);
    }
  }
  return lines;
}
