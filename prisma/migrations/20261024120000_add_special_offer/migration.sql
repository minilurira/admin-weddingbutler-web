-- 스페셜 예약 링크. 앱이 처음 쓸 때도 같은 문장을 실행하므로(src/lib/special.ts) IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS "SpecialOffer" (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS "SpecialOffer_token_key" ON "SpecialOffer"("token");
