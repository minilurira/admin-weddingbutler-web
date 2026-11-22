import { prisma } from "@/lib/prisma";
import { ensureFinanceTables } from "@/lib/finance";

/** 오류 알림방에 넣을 사람(카카오워크 이름). 둘 다 대표 계정이다. */
const MEMBERS = ["이강", "최소연"];

interface KwUser { id: number | string; name?: string; display_name?: string }

async function kw<T>(path: string, init?: RequestInit): Promise<T & { success?: boolean; error?: { message?: string } }> {
  const res = await fetch(`https://api.kakaowork.com/v1/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.KAKAOWORK_APP_KEY}`, "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  return res.json();
}

/** 카카오워크 봇으로 대표 두 명이 들어 있는 새 그룹 대화방을 만들고, 그 방 ID를 저장한다. 이후 서버 오류 알림은 이 방으로 간다. */
export async function createErrorRoom(): Promise<{ ok: boolean; message: string }> {
  if (!process.env.KAKAOWORK_APP_KEY) return { ok: false, message: "KAKAOWORK_APP_KEY가 설정돼 있지 않습니다." };
  try {
    const users: KwUser[] = [];
    let cursor = "";
    for (let i = 0; i < 10; i++) {
      const r = await kw<{ users?: KwUser[]; cursor?: string | null }>(`users.list?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      if (!r.success) return { ok: false, message: `사용자 목록을 불러오지 못했습니다: ${r.error?.message ?? "알 수 없는 오류"}` };
      users.push(...(r.users ?? []));
      if (!r.cursor) break;
      cursor = r.cursor;
    }
    const found = MEMBERS.map((n) => ({ n, u: users.find((x) => x.name === n || x.display_name === n) }));
    const missing = found.filter((f) => !f.u).map((f) => f.n);
    if (missing.length) return { ok: false, message: `카카오워크에서 찾지 못한 사람: ${missing.join(", ")}` };
    const open = await kw<{ conversation?: { id: number | string } }>("conversations.open", { method: "POST", body: JSON.stringify({ user_ids: found.map((f) => Number(f.u!.id)) }) });
    const id = open.conversation?.id;
    if (!open.success || !id) return { ok: false, message: `대화방을 만들지 못했습니다: ${open.error?.message ?? "알 수 없는 오류"}` };
    await ensureFinanceTables();
    await prisma.$executeRawUnsafe(`INSERT INTO "FinanceSetting" ("key", "value") VALUES ('errorConversationId', $1) ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"`, String(id));
    await kw("messages.send", { method: "POST", body: JSON.stringify({ conversation_id: id, text: "웨딩버틀러 오류 알림방입니다. 홈페이지·어드민에서 서버 오류가 생기면 여기로 알려드립니다. (같은 오류는 30분에 한 번)" }) });
    return { ok: true, message: `알림방을 만들었습니다 (${MEMBERS.join(", ")}). 이제 오류가 생기면 그 방으로 알림이 갑니다.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "알림방을 만들지 못했습니다." };
  }
}
