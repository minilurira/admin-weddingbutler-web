// 서버 오류 기록. console.error처럼 쓰면 Vercel 로그에도 남고, 홈페이지 Supabase의 error_logs 표(source="admin")에도 저장돼
// 어드민 "오류 기록"에서 볼 수 있다. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없거나 저장이 실패해도 원래 동작에는 영향이 없다.
//   logError("[alimtalk] send failed", err)
// 개인정보가 남지 않게 전화번호·이메일·키는 가리고, 같은 오류가 몰릴 때는 일부만 저장한다.

const recent = new Map<string, number>();
let windowStart = 0;
let windowCount = 0;

export function redact(text: string): string {
  return text
    .replace(/\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g, "[전화번호]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[이메일]")
    .replace(/(Bearer|PortOne|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [키]")
    .replace(/\b(sk|pk|key|secret|token)[-_A-Za-z0-9]{12,}\b/gi, "[키]");
}

function describe(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

function allowed(key: string): boolean {
  const now = Date.now();
  if (now - windowStart > 60_000) { windowStart = now; windowCount = 0; }
  if (windowCount >= 30) return false;
  const last = recent.get(key) ?? 0;
  if (now - last < 60_000) return false;
  recent.set(key, now);
  if (recent.size > 200) recent.clear();
  windowCount++;
  return true;
}

export async function saveErrorLog(source: string, scope: string, message: string, detail = ""): Promise<void> {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return;
  const msg = redact(message).slice(0, 500);
  if (!allowed(`${source}|${scope}|${msg}`)) return;
  try {
    await fetch(`${url}/rest/v1/error_logs`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ source, scope: scope.slice(0, 80), message: msg, detail: redact(detail).slice(0, 2000) }),
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    // 기록 실패가 서비스에 영향을 주지 않게 한다
  }
}

function split(args: unknown[]): { scope: string; message: string; detail: string } {
  const first = typeof args[0] === "string" ? (args[0] as string) : describe(args[0]);
  const tag = /^\[([^\]]+)\]\s*([\s\S]*)$/.exec(first);
  const err = args.find((a) => a instanceof Error) as Error | undefined;
  return {
    scope: tag ? tag[1] : "",
    message: [tag ? tag[2] : first, ...args.slice(1).map(describe)].filter(Boolean).join(" · "),
    detail: err?.stack ?? "",
  };
}

/** console.error 대신 쓴다: Vercel 로그 + 오류 기록 표 */
export function logError(...args: unknown[]): void {
  console.error(...args);
  const { scope, message, detail } = split(args);
  void saveErrorLog("admin", scope, message, detail);
}

export interface ErrorLogRow { id: number; source: string; scope: string; message: string; detail: string; created_at: string }

/** 최근 오류 기록(어드민 화면용). 표가 없으면 null */
export async function listErrorLogs(source: string, limit = 200): Promise<ErrorLogRow[] | null> {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  const filter = ["home", "admin", "browser"].includes(source) ? `&source=eq.${source}` : "";
  const res = await fetch(`${url}/rest/v1/error_logs?select=*&order=created_at.desc&limit=${limit}${filter}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res || !res.ok) return null;
  return res.json();
}
