import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { homepageUrl } from "@/lib/records";

// 스페셜 예약 링크. 홈페이지 /s/<token> 이 이 모듈의 공개 API(/api/public/special/*)로 링크를 확인·점유·사용 처리한다.

export const SPECIAL_MIN_AMOUNT = 1000;
export const SPECIAL_MAX_AMOUNT = 20_000_000;
export const SPECIAL_MAX_DAYS = 30;
/** 고객이 결제를 시작한 뒤 이 시간이 지나면 다른 사람이 같은 링크로 결제를 시작할 수 있다 */
export const HOLD_MINUTES = 10;

// 운영 DB에는 마이그레이션이 자동 적용되지 않으므로(README) 처음 쓸 때 한 번 만든다. 모두 IF NOT EXISTS.
const DDL = [
  `CREATE TABLE IF NOT EXISTS "SpecialOffer" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "bookingNo" TEXT NOT NULL DEFAULT '',
    "heldAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpecialOffer_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SpecialOffer_token_key" ON "SpecialOffer"("token")`,
];

let ready: Promise<void> | null = null;
export function ensureSpecialTables(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const stmt of DDL) await prisma.$executeRawUnsafe(stmt);
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

export const specialUrl = (token: string) => `${homepageUrl()}/s/${token}`;

export type OfferState = "open" | "held" | "used" | "cancelled" | "expired";

interface OfferRow { status: string; expiresAt: Date; heldAt: Date | null }

/** 화면·API에 보여 줄 상태. 점유(held)가 오래되면 다시 열린(open) 것으로 본다. */
export function stateOf(o: OfferRow, now = new Date()): OfferState {
  if (o.status === "used") return "used";
  if (o.status === "cancelled") return "cancelled";
  if (o.expiresAt.getTime() <= now.getTime()) return "expired";
  if (o.status === "held" && o.heldAt && now.getTime() - o.heldAt.getTime() < HOLD_MINUTES * 60_000) return "held";
  return "open";
}

export async function createOffer(input: { amount: number; label: string; days: number }) {
  await ensureSpecialTables();
  const amount = Math.floor(input.amount);
  if (!(amount >= SPECIAL_MIN_AMOUNT && amount <= SPECIAL_MAX_AMOUNT)) throw new Error(`금액은 ${SPECIAL_MIN_AMOUNT.toLocaleString("ko-KR")}원 이상 ${SPECIAL_MAX_AMOUNT.toLocaleString("ko-KR")}원 이하로 입력해 주세요.`);
  const days = Math.min(SPECIAL_MAX_DAYS, Math.max(1, Math.floor(input.days) || 7));
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  const offer = await prisma.specialOffer.create({
    data: { token: randomBytes(16).toString("base64url"), amount, label: input.label.trim().slice(0, 60), expiresAt },
  });
  return { ...offer, url: specialUrl(offer.token) };
}

export async function getOffer(token: string) {
  await ensureSpecialTables();
  return prisma.specialOffer.findUnique({ where: { token } });
}

/** 결제를 시작하는 순간 링크를 점유한다. 이미 결제됐거나 다른 사람이 진행 중이면 false. */
export async function holdOffer(token: string, bookingNo: string): Promise<boolean> {
  await ensureSpecialTables();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - HOLD_MINUTES * 60_000);
  const { count } = await prisma.specialOffer.updateMany({
    where: {
      token,
      expiresAt: { gt: now },
      OR: [{ status: "open" }, { status: "held", heldAt: { lt: staleBefore } }, { status: "held", bookingNo }],
    },
    data: { status: "held", bookingNo, heldAt: now },
  });
  return count === 1;
}

/** 결제가 확인되면 사용 완료로 바꾼다. 이 예약번호가 점유한 링크만 대상이다. */
export async function useOffer(token: string, bookingNo: string): Promise<boolean> {
  await ensureSpecialTables();
  const { count } = await prisma.specialOffer.updateMany({
    where: { token, bookingNo, status: { in: ["held", "open", "cancelled"] } },
    data: { status: "used", usedAt: new Date() },
  });
  return count === 1;
}

/** 결제가 실패·취소되면 점유를 풀어 같은 고객이 다시 시도할 수 있게 한다. */
export async function releaseOffer(token: string, bookingNo: string): Promise<boolean> {
  await ensureSpecialTables();
  const { count } = await prisma.specialOffer.updateMany({
    where: { token, bookingNo, status: "held" },
    data: { status: "open", bookingNo: "", heldAt: null },
  });
  return count === 1;
}
