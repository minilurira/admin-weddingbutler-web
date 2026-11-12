import { createSign } from "crypto";
import type { Reservation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calcConfirm, onsiteAmount, paymentTypeName, won } from "@/lib/pricing";
import { isWeddingPast, pad2 } from "@/lib/format";
import { logError } from "@/lib/errorLog";

// 예약 확정 시 운영자 구글 캘린더에 일정을 만든다 (서비스 계정 + 캘린더 공유 방식).
// 필요한 환경변수: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, GOOGLE_CALENDAR_ID
// 캘린더(GOOGLE_CALENDAR_ID)는 서비스 계정 이메일에 "일정 변경" 권한으로 공유되어 있어야 한다.
// 설정이 없거나 호출이 실패해도 예약 확정·취소는 그대로 진행된다.

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TIME_ZONE = "Asia/Seoul";
/** 일정 시작 = 예식 시각보다 이만큼 앞 */
const LEAD_MINUTES = 60;
/** 구글 캘린더 일정 색 id. 1 = 라벤더 */
const EVENT_COLOR_ID = "1";

export interface CalendarResult {
  ok: boolean;
  detail: string;
}

const ENV_NAMES = ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", "GOOGLE_CALENDAR_ID"] as const;

/** 붙여 넣은 키를 PEM으로 정리한다: 앞뒤 따옴표, \\n 글자, JSON 통째로 넣은 경우까지 */
function readKeyAndEmail() {
  let key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").trim();
  let email = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "").trim().replace(/^"|"$/g, "");
  if (key.startsWith("{")) {
    try {
      const json = JSON.parse(key) as { private_key?: string; client_email?: string };
      key = json.private_key ?? "";
      if (!email) email = json.client_email ?? "";
    } catch {
      // JSON이 아니면 아래에서 일반 키로 처리
    }
  }
  key = key.replace(/^"|",?$/g, "").replace(/\\n/g, "\n");
  return { key, email };
}

/** 빠진 환경변수 이름 목록 */
export function missingCalendarEnv(): string[] {
  const { key, email } = readKeyAndEmail();
  const missing: string[] = [];
  if (!email) missing.push(ENV_NAMES[0]);
  if (!key) missing.push(ENV_NAMES[1]);
  if (!(process.env.GOOGLE_CALENDAR_ID ?? "").trim()) missing.push(ENV_NAMES[2]);
  return missing;
}

/** GOOGLE_CALENDAR_ID 에 쉼표로 여러 캘린더를 적으면 모두에 저장한다. 첫 번째가 기본 캘린더 */
function calendarIds() {
  return (process.env.GOOGLE_CALENDAR_ID ?? "")
    .split(/[,\s]+/)
    .map((v) => v.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

function config() {
  const { key, email } = readKeyAndEmail();
  const calendars = calendarIds();
  if (!email || !key || !calendars.length) return null;
  return { email, key, calendars };
}

/** Reservation.googleEventId: 캘린더별 일정 id JSON. 예전 값(문자열 하나)은 기본 캘린더의 id로 본다 */
function parseEventIds(stored: string, primary: string | undefined): Record<string, string> {
  if (!stored) return {};
  if (stored.startsWith("{")) {
    try {
      return JSON.parse(stored) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return primary ? { [primary]: stored } : {};
}

function serializeEventIds(ids: Record<string, string>) {
  return Object.keys(ids).length ? JSON.stringify(ids) : "";
}

function errorText(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/\s+/g, " ").slice(0, 300);
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function b64url(v: string | Buffer) {
  return Buffer.from(v).toString("base64url");
}

async function accessToken(cfg: NonNullable<ReturnType<typeof config>>) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: cfg.email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(cfg.key))}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function clock(minutes: number) {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}:00`;
}

/** 예식 1시간 전 ~ 예식 시각. 시간이 미정이면 그날 종일 일정 */
function eventTimes(date: string, time: string) {
  const tm = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!tm) return { start: { date }, end: { date: addDays(date, 1) } };
  const at = Number(tm[1]) * 60 + Number(tm[2]);
  const from = Math.max(0, at - LEAD_MINUTES);
  return {
    start: { dateTime: `${date}T${clock(from)}`, timeZone: TIME_ZONE },
    end: { dateTime: `${date}T${clock(at)}`, timeZone: TIME_ZONE },
  };
}

function eventBody(r: Reservation) {
  const price = calcConfirm({ plan: r.confirmPlan, butlers: r.confirmButlers, extraGuests: r.confirmExtraGuests, discount: r.confirmDiscount, baseOverride: r.requestedTotal });
  const description = [
    `예약번호: ${r.id}`,
    `예식 시각: ${r.confirmTime || "미정"}`,
    `고객: ${r.customer} · ${r.phone}`,
    r.side ? `축의대: ${r.side}` : "",
    `플랜: ${r.confirmPlan} · 버틀러 ${r.confirmButlers}명`,
    r.guestsLabel ? `하객: ${r.guestsLabel}` : "",
    r.confirmHours ? `근무 시간: ${r.confirmHours}` : "",
    `결제: ${paymentTypeName(r.paymentType, r.paidAmount, price.total)} · 결제 ${won(r.paidAmount)} · 현장(현금) ${won(onsiteAmount(price.total, r.paidAmount))}`,
    r.confirmNote ? `확정 메모: ${r.confirmNote}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    summary: `[웨딩버틀러] ${r.couple || r.customer}${r.confirmVenue ? ` · ${r.confirmVenue}` : ""}`,
    location: r.confirmVenue,
    description,
    // 구글 캘린더 일정 색 "라벤더"(연보라)
    colorId: EVENT_COLOR_ID,
    ...eventTimes(r.confirmDate, r.confirmTime),
  };
}

async function calendarFetch(cfg: NonNullable<ReturnType<typeof config>>, calendarId: string, path: string, init: RequestInit) {
  const token = await accessToken(cfg);
  return fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
}

/** 확정 예약의 일정을 캘린더마다 만들거나(처음) 고친다(이미 있으면). 일정 id는 Reservation.googleEventId에 저장 */
export async function syncReservationEvent(r: Reservation): Promise<CalendarResult> {
  const cfg = config();
  if (!cfg) return { ok: false, detail: "설정 없음(건너뜀)" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.confirmDate)) return { ok: false, detail: "예식 날짜 없음(건너뜀)" };
  const ids = parseEventIds(r.googleEventId, cfg.calendars[0]);
  const body = JSON.stringify(eventBody(r));
  const errors: string[] = [];
  let created = 0;
  let updated = 0;
  for (const cal of cfg.calendars) {
    try {
      if (ids[cal]) {
        const res = await calendarFetch(cfg, cal, `/${encodeURIComponent(ids[cal])}`, { method: "PUT", body });
        if (res.ok) {
          updated++;
          continue;
        }
        // 캘린더에서 직접 지운 일정이면 새로 만든다
        if (res.status !== 404 && res.status !== 410) throw new Error(`update ${res.status}: ${await res.text()}`);
      }
      const res = await calendarFetch(cfg, cal, "", { method: "POST", body });
      if (!res.ok) throw new Error(`insert ${res.status}: ${await res.text()}`);
      ids[cal] = ((await res.json()) as { id: string }).id;
      created++;
    } catch (err) {
      logError(`[google-calendar] sync failed (${r.id}, ${cal})`, err);
      errors.push(`${cal} ${errorText(err)}`);
    }
  }
  const stored = serializeEventIds(ids);
  if (stored !== r.googleEventId) await prisma.reservation.update({ where: { id: r.id }, data: { googleEventId: stored } });
  if (errors.length) return { ok: false, detail: `실패: ${errors.join(" / ")}` };
  return { ok: true, detail: created ? `일정 등록 ${created}곳${updated ? `, 수정 ${updated}곳` : ""}` : `일정 수정 ${updated}곳` };
}

/** 예약 취소 시 모든 캘린더의 일정을 지운다 */
export async function deleteReservationEvent(r: Pick<Reservation, "id" | "googleEventId">): Promise<CalendarResult> {
  if (!r.googleEventId) return { ok: true, detail: "일정 없음" };
  const cfg = config();
  if (!cfg) return { ok: false, detail: "설정 없음(건너뜀)" };
  const ids = parseEventIds(r.googleEventId, cfg.calendars[0]);
  let failed = false;
  for (const [cal, eventId] of Object.entries(ids)) {
    try {
      const res = await calendarFetch(cfg, cal, `/${encodeURIComponent(eventId)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`delete ${res.status}: ${await res.text()}`);
      delete ids[cal];
    } catch (err) {
      logError(`[google-calendar] delete failed (${r.id}, ${cal})`, err);
      failed = true;
    }
  }
  await prisma.reservation.update({ where: { id: r.id }, data: { googleEventId: serializeEventIds(ids) } });
  return failed ? { ok: false, detail: "삭제 실패" } : { ok: true, detail: "일정 삭제" };
}

/** 예식이 아직 지나지 않은 확정 예약 중 일정이 빠진 캘린더가 있는 것을 등록한다.
 * refreshAll이면 이미 등록된 일정도 최신 내용·색으로 고친다 ([지금 다시 등록]).
 * 방금(2분 안) 바뀐 예약은 확정 처리 중일 수 있어 건너뛴다 (중복 일정 방지) */
export async function backfillConfirmedEvents(refreshAll = false) {
  if (!config()) return { configured: false, created: 0, failed: 0, firstError: "" };
  const rows = refreshAll ? await upcomingRows() : await pendingRows();
  let created = 0;
  let failed = 0;
  let firstError = "";
  for (const r of rows) {
    const result = await syncReservationEvent(r);
    if (result.ok) created++;
    else {
      failed++;
      if (!firstError) firstError = `${r.id} ${result.detail}`;
    }
  }
  return { configured: true, created, failed, firstError };
}

/** 예식 전 확정 예약 (방금 바뀐 것 제외) */
async function upcomingRows() {
  const rows = await prisma.reservation.findMany({ where: { status: "확정", updatedAt: { lt: new Date(Date.now() - 2 * 60 * 1000) } }, orderBy: { confirmDate: "asc" } });
  return rows.filter((r) => !isWeddingPast(r.confirmDate, r.confirmTime));
}

/** 예식 전인데 아직 일정이 없는 캘린더가 있는 확정 예약 */
async function pendingRows() {
  const calendars = calendarIds();
  const rows = await upcomingRows();
  return rows.filter((r) => {
    const ids = parseEventIds(r.googleEventId, calendars[0]);
    return calendars.some((c) => !ids[c]);
  });
}

/** 캘린더 화면에 보여 줄 연결 상태 */
export async function calendarStatus() {
  const [pending, registered] = await Promise.all([
    pendingRows().then((r) => r.length),
    prisma.reservation.count({ where: { status: "확정", googleEventId: { not: "" } } }),
  ]);
  return { missing: missingCalendarEnv(), pending, registered, calendars: calendarIds().length };
}

const AUTO_BACKFILL_INTERVAL_MS = 10 * 60 * 1000;
let lastAutoBackfill = 0;

/**
 * 어드민 화면을 열 때 백그라운드로 부른다 (src/app/(admin)/layout.tsx, waitUntil).
 * 서버 인스턴스마다 10분에 한 번만 돌고, 일정이 없는 예식 전 확정 예약(기존 예약·저장 실패 건)을 채운다.
 */
export async function autoBackfillConfirmedEvents() {
  if (!config() || Date.now() - lastAutoBackfill < AUTO_BACKFILL_INTERVAL_MS) return;
  lastAutoBackfill = Date.now();
  try {
    await backfillConfirmedEvents();
  } catch (err) {
    logError("[google-calendar] auto backfill failed", err);
  }
}
