export interface GridEvent {
  id: string;
  time: string;
  customer: string;
  venue: string;
  staff: string;
}

export interface GridCell {
  num: number;
  key: string | null;
  dim: boolean;
  dow: number;
  events: GridEvent[];
}

export function buildMonthGrid(
  year: number,
  month: number, // 0-indexed
  eventsByDate: Map<string, GridEvent[]>
): GridCell[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthPrefix = `${year}-${pad(month + 1)}`;
  const startPad = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const cells: GridCell[] = [];
  for (let i = startPad - 1; i >= 0; i--) {
    cells.push({ num: prevDays - i, dim: true, key: null, dow: (startPad - 1 - i) % 7, events: [] });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ num: d, dim: false, key: `${monthPrefix}-${pad(d)}`, dow: cells.length % 7, events: [] });
  }
  let tail = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ num: tail++, dim: true, key: null, dow: cells.length % 7, events: [] });
  }

  return cells.map((cell) => ({ ...cell, events: cell.key ? eventsByDate.get(cell.key) ?? [] : [] }));
}
