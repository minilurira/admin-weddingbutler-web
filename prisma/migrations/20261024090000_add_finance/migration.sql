-- 정산 관리 테이블. 앱이 처음 /finance를 열 때도 같은 문장을 실행하므로(src/lib/finance.ts) 모두 IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS "FinanceCost" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "memo" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceCost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Butler" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Butler_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ButlerShift" (
    "id" TEXT NOT NULL,
    "butlerId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "pay" INTEGER NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ButlerShift_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ButlerShift_butlerId_fkey" FOREIGN KEY ("butlerId") REFERENCES "Butler"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ButlerShift_date_idx" ON "ButlerShift"("date");

CREATE TABLE IF NOT EXISTS "FinanceCash" (
    "reservationId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinanceCash_pkey" PRIMARY KEY ("reservationId")
);

CREATE TABLE IF NOT EXISTS "FinanceSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "FinanceSetting_pkey" PRIMARY KEY ("key")
);
