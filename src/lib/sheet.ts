// 브라우저 전용: 하객 명단 엑셀(.xlsx)·CSV를 2차원 문자열 배열로 읽는다.
// 외부 라이브러리 없이 xlsx(zip)를 직접 풀고 첫 번째 시트만 읽는다.

export async function readSheet(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) return readXlsx(new Uint8Array(await file.arrayBuffer()));
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCsv(decodeText(new Uint8Array(await file.arrayBuffer())));
  throw new Error("엑셀(.xlsx) 또는 CSV 파일만 올릴 수 있어요. 예전 형식(.xls)은 .xlsx로 다시 저장해 주세요.");
}

function decodeText(bytes: Uint8Array) {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  // 한국어 윈도우 엑셀이 저장한 CSV는 EUC-KR(CP949)인 경우가 많다
  if (utf8.includes("�")) {
    try {
      return new TextDecoder("euc-kr").decode(bytes);
    } catch {
      return utf8;
    }
  }
  return utf8.replace(/^﻿/, "");
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function unzip(buf: Uint8Array): Promise<Map<string, Uint8Array>> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (u32(buf, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("엑셀 파일을 읽지 못했어요. 파일이 손상되지 않았는지 확인해 주세요.");

  const files = new Map<string, Uint8Array>();
  const count = u16(buf, eocd + 10);
  let p = u32(buf, eocd + 16);
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (u32(buf, p) !== 0x02014b50) break;
    const method = u16(buf, p + 10);
    const size = u32(buf, p + 20);
    const nameLen = u16(buf, p + 28);
    const extraLen = u16(buf, p + 30);
    const commentLen = u16(buf, p + 32);
    const local = u32(buf, p + 42);
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    const start = local + 30 + u16(buf, local + 26) + u16(buf, local + 28);
    const raw = buf.subarray(start, start + size);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, await inflate(raw));
  }
  return files;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function xml(bytes: Uint8Array | undefined) {
  return bytes ? new DOMParser().parseFromString(new TextDecoder().decode(bytes), "application/xml") : null;
}

const all = (node: Document | Element, tag: string) => Array.from(node.getElementsByTagNameNS("*", tag));

function colIndex(ref: string) {
  const letters = ref.replace(/[^A-Z]/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

async function readXlsx(buf: Uint8Array): Promise<string[][]> {
  const files = await unzip(buf);
  const shared = all(xml(files.get("xl/sharedStrings.xml")) ?? new Document(), "si").map((si) =>
    all(si, "t").map((t) => t.textContent ?? "").join("")
  );
  const sheetName = files.has("xl/worksheets/sheet1.xml")
    ? "xl/worksheets/sheet1.xml"
    : Array.from(files.keys()).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  const sheet = xml(files.get(sheetName));
  if (!sheet) throw new Error("엑셀 파일에서 시트를 찾지 못했어요.");

  return all(sheet, "row").map((rowEl) => {
    const row: string[] = [];
    all(rowEl, "c").forEach((c, i) => {
      const ref = c.getAttribute("r");
      const idx = ref ? colIndex(ref) : i;
      const type = c.getAttribute("t");
      const v = all(c, "v")[0]?.textContent ?? "";
      let value = v;
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = all(c, "t").map((t) => t.textContent ?? "").join("");
      while (row.length < idx) row.push("");
      row[idx] = value;
    });
    return row;
  });
}

export interface ParsedGuest {
  envelopeNo: number;
  side: "신랑측" | "신부측";
  name: string;
  relation: string;
  amount: number | null;
  tickets: number;
  memo: string;
}

const HEADERS: [keyof ParsedGuest, RegExp][] = [
  ["envelopeNo", /봉투|번호|no/i],
  ["side", /구분|측/],
  ["name", /이름|성명|성함/],
  ["relation", /관계/],
  ["amount", /금액|축의/],
  ["tickets", /식권/],
  ["memo", /메모|비고/],
];

export const TEMPLATE_HEADER = ["봉투번호", "구분(신랑측/신부측)", "이름", "관계", "금액", "식권", "메모"];

const num = (v: string) => Number(String(v).replace(/[^0-9]/g, "")) || 0;

/** 머리글(이름·금액 등)을 찾아 열을 맞춘다. 머리글이 없으면 양식 순서로 읽는다. */
export function toGuests(rows: string[][]): ParsedGuest[] {
  const headerAt = rows.slice(0, 5).findIndex((r) => r.some((c) => /이름|성명|성함/.test(c)));
  const cols = new Map<keyof ParsedGuest, number>();
  if (headerAt >= 0) {
    rows[headerAt].forEach((c, i) => {
      const hit = HEADERS.find(([key, re]) => !cols.has(key) && re.test(c.trim()));
      if (hit) cols.set(hit[0], i);
    });
  } else {
    HEADERS.forEach(([key], i) => cols.set(key, i));
  }
  const get = (r: string[], key: keyof ParsedGuest) => {
    const i = cols.get(key);
    return i == null ? "" : String(r[i] ?? "").trim();
  };

  const body = rows.slice(headerAt + 1).filter((r) => get(r, "name"));
  let next = 1;
  return body.map((r): ParsedGuest => {
    const no = num(get(r, "envelopeNo")) || next;
    next = no + 1;
    const amountText = get(r, "amount");
    return {
      envelopeNo: no,
      side: get(r, "side").includes("신부") ? "신부측" : "신랑측",
      name: get(r, "name"),
      relation: get(r, "relation"),
      amount: amountText ? num(amountText) : null,
      tickets: num(get(r, "tickets")),
      memo: get(r, "memo"),
    };
  });
}
