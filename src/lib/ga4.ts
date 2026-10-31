import { createSign } from "crypto";

// GA4 Data API(v1beta)를 서비스 계정으로 호출한다. 구글 SDK 대신 Node 내장 crypto로 JWT를 서명해
// 액세스 토큰을 받는다(새 패키지 없음).
// 환경변수: GA4_PROPERTY_ID(숫자 속성 ID, G-로 시작하는 측정 ID 아님), GA4_SERVICE_ACCOUNT_JSON(키 파일 내용 전체)

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function config(): { propertyId: string; account: ServiceAccount } | null {
  const propertyId = (process.env.GA4_PROPERTY_ID || "").replace(/^properties\//, "").trim();
  const raw = (process.env.GA4_SERVICE_ACCOUNT_JSON || "").trim();
  if (!propertyId || !raw) return null;
  try {
    // 값을 base64로 넣은 경우도 받아 준다.
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) return null;
    return { propertyId, account: { client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, "\n") } };
  } catch {
    return null;
  }
}

export function ga4Configured() {
  return config() !== null;
}

// 설정은 있는데 JSON이 깨진 경우를 구분해서 안내하기 위함
export function ga4ConfigProblem(): string | null {
  const hasId = Boolean((process.env.GA4_PROPERTY_ID || "").trim());
  const hasKey = Boolean((process.env.GA4_SERVICE_ACCOUNT_JSON || "").trim());
  if (!hasId && !hasKey) return null;
  if (!hasId) return "GA4_PROPERTY_ID가 비어 있습니다.";
  if (!hasKey) return "GA4_SERVICE_ACCOUNT_JSON이 비어 있습니다.";
  if (!config()) return "GA4_SERVICE_ACCOUNT_JSON을 읽지 못했습니다. 키 파일 내용 전체({ 부터 } 까지)를 넣었는지 확인해 주세요.";
  return null;
}

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

let tokenCache: { token: string; exp: number } | null = null;

async function accessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.token;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${b64url(signer.sign(account.private_key))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`구글 인증 실패(${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, exp: now + data.expires_in };
  return data.access_token;
}

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;
}

interface ReportRequest {
  dateRanges: DateRange[];
  dimensions?: { name: string }[];
  metrics: { name: string }[];
  orderBys?: unknown[];
  limit?: number;
  dimensionFilter?: unknown;
}

interface ReportRow {
  dimensionValues?: { value: string }[];
  metricValues?: { value: string }[];
}

interface Report {
  rows?: ReportRow[];
}

async function batchRunReports(requests: ReportRequest[]): Promise<Report[]> {
  const cfg = config();
  if (!cfg) throw new Error("GA4 설정이 없습니다.");
  const token = await accessToken(cfg.account);
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${cfg.propertyId}:batchRunReports`, {
    method: "POST",
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 403) throw new Error(`GA4 속성에 접근 권한이 없습니다. GA4 관리 → 속성 액세스 관리에 서비스 계정(${cfg.account.client_email})을 뷰어로 추가했는지 확인해 주세요. (${text.slice(0, 200)})`);
    throw new Error(`GA4 Data API 오류(${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { reports?: Report[] };
  return data.reports ?? [];
}

export interface NamedCount {
  name: string;
  value: number;
}

export interface Ga4Summary {
  current: { users: number; sessions: number; pageViews: number };
  previous: { users: number; sessions: number; pageViews: number };
  daily: { date: string; sessions: number; users: number }[]; // date: YYYY-MM-DD
  channels: NamedCount[];
  sourceMedium: NamedCount[];
  landingPages: NamedCount[];
  devices: NamedCount[];
  organic: { naver: number; google: number; naverPrev: number; googlePrev: number };
}

const num = (v: string | undefined) => Number(v ?? 0) || 0;

function toNamed(report: Report | undefined): NamedCount[] {
  return (report?.rows ?? []).map((r) => ({ name: r.dimensionValues?.[0]?.value || "(없음)", value: num(r.metricValues?.[0]?.value) }));
}

// 같은 기간을 여러 번 열어도 할당량을 아끼도록 10분 동안 메모리에 보관
const cache = new Map<string, { at: number; data: Ga4Summary }>();
const TTL = 10 * 60_000;

export async function ga4Summary(current: DateRange, previous: DateRange): Promise<Ga4Summary> {
  const key = `${current.startDate}~${current.endDate}|${previous.startDate}~${previous.endDate}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const desc = [{ metric: { metricName: "sessions" }, desc: true }];
  const [first, second] = await Promise.all([
    batchRunReports([
      // 0: 두 기간 합계 (기간이 둘이면 dateRange 차원이 자동으로 붙는다)
      { dateRanges: [current, previous], metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }] },
      // 1: 일별
      { dateRanges: [current], dimensions: [{ name: "date" }], metrics: [{ name: "sessions" }, { name: "activeUsers" }], orderBys: [{ dimension: { dimensionName: "date" } }], limit: 400 },
      // 2: 채널
      { dateRanges: [current], dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }], orderBys: desc, limit: 20 },
      // 3: 소스/매체
      { dateRanges: [current], dimensions: [{ name: "sessionSourceMedium" }], metrics: [{ name: "sessions" }], orderBys: desc, limit: 10 },
      // 4: 랜딩 페이지
      { dateRanges: [current], dimensions: [{ name: "landingPage" }], metrics: [{ name: "sessions" }], orderBys: desc, limit: 10 },
    ]),
    batchRunReports([
      // 0: 기기
      { dateRanges: [current], dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "sessions" }], orderBys: desc, limit: 10 },
      // 1: 자연검색 소스별(두 기간)
      {
        dateRanges: [current, previous],
        dimensions: [{ name: "sessionSource" }],
        metrics: [{ name: "sessions" }],
        dimensionFilter: { filter: { fieldName: "sessionMedium", stringFilter: { matchType: "EXACT", value: "organic" } } },
        limit: 50,
      },
    ]),
  ]);

  const totals = { current: { users: 0, sessions: 0, pageViews: 0 }, previous: { users: 0, sessions: 0, pageViews: 0 } };
  for (const r of first[0]?.rows ?? []) {
    const target = r.dimensionValues?.[0]?.value === "date_range_1" ? totals.previous : totals.current;
    target.users = num(r.metricValues?.[0]?.value);
    target.sessions = num(r.metricValues?.[1]?.value);
    target.pageViews = num(r.metricValues?.[2]?.value);
  }

  const daily = (first[1]?.rows ?? []).map((r) => {
    const d = r.dimensionValues?.[0]?.value ?? "";
    return { date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, sessions: num(r.metricValues?.[0]?.value), users: num(r.metricValues?.[1]?.value) };
  });

  const organic = { naver: 0, google: 0, naverPrev: 0, googlePrev: 0 };
  for (const r of second[1]?.rows ?? []) {
    const source = (r.dimensionValues?.[0]?.value ?? "").toLowerCase();
    const prev = r.dimensionValues?.[1]?.value === "date_range_1";
    const v = num(r.metricValues?.[0]?.value);
    if (source.includes("naver")) prev ? (organic.naverPrev += v) : (organic.naver += v);
    else if (source.includes("google")) prev ? (organic.googlePrev += v) : (organic.google += v);
  }

  const data: Ga4Summary = {
    ...totals,
    daily,
    channels: toNamed(first[2]),
    sourceMedium: toNamed(first[3]),
    landingPages: toNamed(first[4]),
    devices: toNamed(second[0]),
    organic,
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}
