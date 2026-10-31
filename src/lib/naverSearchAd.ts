import { createHmac } from "crypto";

// 네이버 검색광고 API 키워드도구(/keywordstool)로 키워드별 최근 한 달 검색수를 가져온다.
// 광고를 집행하지 않아도 검색광고 계정에서 API 키만 발급받으면 쓸 수 있다.
// 환경변수: NAVER_SEARCHAD_CUSTOMER_ID, NAVER_SEARCHAD_API_KEY, NAVER_SEARCHAD_SECRET,
//          NAVER_SEARCHAD_KEYWORDS(선택, 쉼표 구분. 비우면 DEFAULT_KEYWORDS)

const DEFAULT_KEYWORDS = ["웨딩버틀러", "축의대대행", "축의금대행", "결혼식도우미", "하객도우미"];

function config() {
  const customerId = (process.env.NAVER_SEARCHAD_CUSTOMER_ID || "").trim();
  const apiKey = (process.env.NAVER_SEARCHAD_API_KEY || "").trim();
  const secret = (process.env.NAVER_SEARCHAD_SECRET || "").trim();
  return customerId && apiKey && secret ? { customerId, apiKey, secret } : null;
}

export function searchAdConfigured() {
  return config() !== null;
}

export function trackedKeywords(): string[] {
  const list = (process.env.NAVER_SEARCHAD_KEYWORDS || "")
    .split(",")
    .map((k) => k.replace(/\s+/g, "")) // 키워드도구는 공백을 받지 않는다
    .filter(Boolean);
  return list.length ? Array.from(new Set(list)) : DEFAULT_KEYWORDS;
}

export interface KeywordVolume {
  keyword: string;
  pc: number | null; // null = 10 미만
  mobile: number | null;
  competition: string; // 높음/중간/낮음
}

// API는 검색수가 적으면 "< 10" 문자열을 준다
const count = (v: unknown): number | null => (typeof v === "number" ? v : null);

let cache: { at: number; key: string; data: KeywordVolume[] } | null = null;
const TTL = 6 * 3600_000; // 월간 수치라 자주 바뀌지 않는다

async function fetchChunk(cfg: NonNullable<ReturnType<typeof config>>, keywords: string[]) {
  const path = "/keywordstool";
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", cfg.secret).update(`${timestamp}.GET.${path}`).digest("base64");
  const qs = new URLSearchParams({ hintKeywords: keywords.join(","), showDetail: "1" });
  const res = await fetch(`https://api.searchad.naver.com${path}?${qs}`, {
    cache: "no-store",
    headers: { "X-Timestamp": timestamp, "X-API-KEY": cfg.apiKey, "X-Customer": cfg.customerId, "X-Signature": signature },
  });
  if (!res.ok) throw new Error(`네이버 검색광고 API 오류(${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { keywordList?: { relKeyword: string; monthlyPcQcCnt: unknown; monthlyMobileQcCnt: unknown; compIdx: string }[] };
  return data.keywordList ?? [];
}

export async function keywordVolumes(): Promise<KeywordVolume[]> {
  const cfg = config();
  if (!cfg) return [];
  const keywords = trackedKeywords();
  const key = keywords.join(",");
  if (cache && cache.key === key && Date.now() - cache.at < TTL) return cache.data;

  // 한 번에 키워드 5개까지
  const rows: Awaited<ReturnType<typeof fetchChunk>> = [];
  for (let i = 0; i < keywords.length; i += 5) rows.push(...(await fetchChunk(cfg, keywords.slice(i, i + 5))));

  const byKeyword = new Map(rows.map((r) => [r.relKeyword.replace(/\s+/g, "").toLowerCase(), r]));
  const data = keywords.map((keyword) => {
    const r = byKeyword.get(keyword.toLowerCase());
    return { keyword, pc: r ? count(r.monthlyPcQcCnt) : null, mobile: r ? count(r.monthlyMobileQcCnt) : null, competition: r?.compIdx ?? "-" };
  });
  cache = { at: Date.now(), key, data };
  return data;
}
