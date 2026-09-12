export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function formatStamp(d: Date) {
  return `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function toNum(v: string | number) {
  return Number(String(v).replace(/[^0-9]/g, "")) || 0;
}
