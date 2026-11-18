import { prisma } from "@/lib/prisma";

/**
 * 고객이 홈페이지 예약 때 고른 "알게 된 경로". Reservation 테이블을 바꾸지 않고 별도 테이블에 둔다
 * (운영 DB에는 마이그레이션이 자동 적용되지 않으므로 처음 쓸 때 한 번 만든다).
 */
let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= prisma
    .$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ReservationSource" ("reservationId" TEXT PRIMARY KEY, "source" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
    .then(() => undefined)
    .catch((e) => { ready = null; throw e; });
  return ready;
}

export async function saveReservationSource(id: string, source: string): Promise<void> {
  const s = source.trim().slice(0, 60);
  if (!s) return;
  await ensure();
  await prisma.$executeRawUnsafe(`INSERT INTO "ReservationSource" ("reservationId", "source") VALUES ($1, $2) ON CONFLICT ("reservationId") DO UPDATE SET "source" = EXCLUDED."source"`, id, s);
}

export async function getReservationSource(id: string): Promise<string> {
  try {
    await ensure();
    const rows = await prisma.$queryRawUnsafe<{ source: string }[]>(`SELECT "source" FROM "ReservationSource" WHERE "reservationId" = $1`, id);
    return rows[0]?.source ?? "";
  } catch {
    return ""; // 경로 표시는 보조 정보라 실패해도 예약 화면은 그대로 보여 준다
  }
}
