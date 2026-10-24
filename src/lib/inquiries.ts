// 홈페이지 문의하기 폼(weddingbutler.co.kr/contact)은 홈페이지 Supabase의 contact_messages에 저장된다.
// 어드민은 복사본을 두지 않고 Supabase REST(PostgREST)로 직접 읽고, 처리완료·메모만 같은 행에 쓴다.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 홈페이지 Vercel의 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 와 같은 값.

export interface Inquiry {
  id: string;
  name: string;
  phone: string;
  ceremony_date: string | null;
  area: string | null;
  topic: string;
  message: string;
  created_at: string;
  handled_at: string | null;
  admin_memo: string;
  // 고객에게 보낸 답변. 홈페이지 Supabase에 alter table로 추가한 컬럼 — 추가 전에는 undefined.
  reply_text?: string | null;
  replied_at?: string | null;
  reply_channel?: string | null;
}

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return url && key ? { url, key } : null;
}

export function inquiriesConfigured() {
  return supabaseConfig() !== null;
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const cfg = supabaseConfig();
  if (!cfg) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다.");
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`[inquiries] Supabase ${res.status}: ${await res.text()}`);
  return res;
}

export async function listInquiries(): Promise<Inquiry[]> {
  const res = await supabaseFetch(
    // select=* — 답변 컬럼 SQL을 실행하기 전에도 목록이 깨지지 않게 컬럼을 나열하지 않는다.
    "contact_messages?select=*&order=created_at.desc"
  );
  return res.json();
}

export async function getInquiry(id: string): Promise<Inquiry | null> {
  const res = await supabaseFetch(`contact_messages?select=*&id=eq.${encodeURIComponent(id)}`);
  const rows: Inquiry[] = await res.json();
  return rows[0] ?? null;
}

export async function updateInquiries(
  ids: string[],
  fields: { handled_at?: string | null; admin_memo?: string; reply_text?: string; replied_at?: string; reply_channel?: string }
) {
  if (ids.length === 0) return;
  const list = ids.map((id) => encodeURIComponent(id)).join(",");
  await supabaseFetch(`contact_messages?id=in.(${list})`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(fields),
  });
}
