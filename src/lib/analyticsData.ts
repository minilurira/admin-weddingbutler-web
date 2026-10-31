import { prisma } from "@/lib/prisma";
import { reservationTotal } from "@/lib/view";
import { inquiriesConfigured, listInquiries } from "@/lib/inquiries";

// 유입·검색 대시보드의 기간 계산과 어드민 DB(예약)·홈페이지 Supabase(문의) 지표.
// 날짜는 모두 한국 시간 기준 YYYY-MM-DD 문자열로 다룬다. 서버는 UTC로 돈다.

export const RANGE_OPTIONS = [
  { key: "7d", label: "최근 7일" },
  { key: "28d", label: "최근 28일" },
  { key: "90d", label: "최근 90일" },
  { key: "month", label: "이번 달" },
  { key: "lastmonth", label: "지난 달" },
] as const;

export type RangeKey = (typeof RANGE_OPTIONS)[number]["key"];

export interface Period {
  key: RangeKey;
  label: string;
  start: string;
  end: string; // 포함
  prevStart: string;
  prevEnd: string;
  days: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
// YYYY-MM-DD를 그 날짜의 UTC 자정 Date로(날짜 계산용)
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (s: string, n: number) => ymd(new Date(parse(s).getTime() + n * 86400_000));

export function kstToday(now = new Date()) {
  return ymd(new Date(now.getTime() + 9 * 3600_000));
}

// 한국 시간 날짜의 시작 시각(UTC Date)
export function kstStartOf(day: string) {
  return new Date(parse(day).getTime() - 9 * 3600_000);
}

function daysBetween(start: string, end: string) {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function resolvePeriod(raw: string | undefined, now = new Date()): Period {
  const key: RangeKey = (RANGE_OPTIONS.find((o) => o.key === raw)?.key ?? "28d") as RangeKey;
  const label = RANGE_OPTIONS.find((o) => o.key === key)!.label;
  const today = kstToday(now);
  const [y, m] = today.split("-").map(Number);
  let start: string, end: string, prevStart: string, prevEnd: string;

  if (key === "month") {
    start = `${y}-${pad(m)}-01`;
    end = today;
    // 지난 달 같은 날짜까지(지난 달이 더 짧으면 말일까지)
    const prevMonthStart = ymd(new Date(Date.UTC(y, m - 2, 1)));
    const prevMonthLast = ymd(new Date(Date.UTC(y, m - 1, 0)));
    prevStart = prevMonthStart;
    const candidate = addDays(prevMonthStart, daysBetween(start, end).length - 1);
    prevEnd = candidate < prevMonthLast ? candidate : prevMonthLast;
  } else if (key === "lastmonth") {
    start = ymd(new Date(Date.UTC(y, m - 2, 1)));
    end = ymd(new Date(Date.UTC(y, m - 1, 0)));
    prevStart = ymd(new Date(Date.UTC(y, m - 3, 1)));
    prevEnd = ymd(new Date(Date.UTC(y, m - 2, 0)));
  } else {
    const n = key === "7d" ? 7 : key === "28d" ? 28 : 90;
    end = today;
    start = addDays(today, -(n - 1));
    prevEnd = addDays(start, -1);
    prevStart = addDays(prevEnd, -(n - 1));
  }
  return { key, label, start, end, prevStart, prevEnd, days: daysBetween(start, end) };
}

export interface BusinessStats {
  requested: number;
  requestedPrev: number;
  confirmed: number;
  cancelled: number;
  paidAmount: number;
  dailyRequested: Record<string, number>;
  inquiries: number | null; // null = Supabase 미설정 또는 오류
  inquiriesPrev: number | null;
  inquiriesOpen: number | null;
  dailyInquiries: Record<string, number>;
}

export async function businessStats(p: Period): Promise<BusinessStats> {
  const from = kstStartOf(p.prevStart);
  const to = kstStartOf(addDays(p.end, 1));
  const curFrom = kstStartOf(p.start);

  const reservations = await prisma.reservation.findMany({ where: { requestedAt: { gte: from, lt: to } } });
  const cur = reservations.filter((r) => r.requestedAt >= curFrom);
  const dailyRequested: Record<string, number> = {};
  for (const r of cur) {
    const d = kstToday(r.requestedAt);
    dailyRequested[d] = (dailyRequested[d] ?? 0) + 1;
  }
  const confirmed = cur.filter((r) => r.status === "확정");

  let inquiries: number | null = null;
  let inquiriesPrev: number | null = null;
  let inquiriesOpen: number | null = null;
  const dailyInquiries: Record<string, number> = {};
  if (inquiriesConfigured()) {
    try {
      const all = await listInquiries();
      const inRange = all.filter((q) => {
        const t = new Date(q.created_at);
        return t >= from && t < to;
      });
      const curQ = inRange.filter((q) => new Date(q.created_at) >= curFrom);
      inquiries = curQ.length;
      inquiriesPrev = inRange.length - curQ.length;
      inquiriesOpen = curQ.filter((q) => !q.handled_at).length;
      for (const q of curQ) {
        const d = kstToday(new Date(q.created_at));
        dailyInquiries[d] = (dailyInquiries[d] ?? 0) + 1;
      }
    } catch (e) {
      console.error("[analytics] 문의 집계 실패", e);
    }
  }

  return {
    requested: cur.length,
    requestedPrev: reservations.length - cur.length,
    confirmed: confirmed.length,
    cancelled: cur.filter((r) => r.status === "취소").length,
    paidAmount: confirmed.reduce((sum, r) => sum + reservationTotal(r), 0),
    dailyRequested,
    inquiries,
    inquiriesPrev,
    inquiriesOpen,
    dailyInquiries,
  };
}
