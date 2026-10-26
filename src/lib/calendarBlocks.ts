import { TIME_SLOTS } from "@/lib/format";

export interface BlockLike { startTime: string; endTime: string }

/** 막은 기록들 → 고를 수 없는 예식 시간(TIME_SLOTS) 목록. 시작·종료 시각이 비어 있으면 종일. */
export function slotsBlockedBy(blocks: BlockLike[]): string[] {
  const out = new Set<string>();
  for (const b of blocks) {
    if (!b.startTime || !b.endTime) TIME_SLOTS.forEach((t) => out.add(t));
    else TIME_SLOTS.filter((t) => t >= b.startTime && t <= b.endTime).forEach((t) => out.add(t));
  }
  return TIME_SLOTS.filter((t) => out.has(t));
}

/** 화면에 보여 줄 짧은 이름: "종일" 또는 "15:00~17:00" */
export function blockLabel(b: BlockLike): string {
  return !b.startTime || !b.endTime ? "종일" : b.startTime === b.endTime ? b.startTime : `${b.startTime}~${b.endTime}`;
}

/** from~to(YYYY-MM-DD, 양 끝 포함)의 모든 날짜 */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const end = Date.UTC(ty, tm - 1, td);
  for (let t = Date.UTC(fy, fm - 1, fd); t <= end && out.length < 400; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
