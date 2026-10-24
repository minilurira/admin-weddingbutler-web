export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 서버(Vercel)는 UTC로 돌기 때문에 getHours()를 그대로 쓰면 9시간 이르게 보인다 — 한국 시간으로 맞춘다.
export function formatStamp(d: Date) {
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  return `${pad2(k.getUTCMonth() + 1)}.${pad2(k.getUTCDate())} ${pad2(k.getUTCHours())}:${pad2(k.getUTCMinutes())}`;
}

export function toNum(v: string | number) {
  return Number(String(v).replace(/[^0-9]/g, "")) || 0;
}

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

// dateStr: "YYYY-MM-DD", timeStr: "HH:MM" -> "2026년 9월 19일 (토) 12:00"
export function formatWishDateLabel(dateStr: string, timeStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const weekday = WEEKDAYS_KO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}년 ${m}월 ${d}일 (${weekday}) ${timeStr}`;
}

// 홈페이지 예약 화면(src/lib/plans.ts TIME_SLOTS)과 같은 예식 시간 목록
export const TIME_SLOTS = ["11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00"];

/** 숫자만 남긴 휴대폰 번호를 010-0000-0000 형식으로. 형식이 다르면 입력 그대로 */
export function formatPhone(v: string) {
  const d = v.replace(/[^0-9]/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return v.trim();
}

/** 고객이 자유롭게 쓴 날짜("2026-11-14", "2026.11.14", "2026년 11월 14일")를 YYYY-MM-DD로. 못 읽으면 "" */
export function parseLooseDate(v: string | null | undefined) {
  const m = String(v ?? "").match(/(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (!m) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "";
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}
