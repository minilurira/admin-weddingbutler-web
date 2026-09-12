export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function formatStamp(d: Date) {
  return `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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
