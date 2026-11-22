CREATE TABLE IF NOT EXISTS "ButlerInvite" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "butlerId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "side" TEXT NOT NULL DEFAULT '',
    "need" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ButlerInvite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ButlerInvite_token_key" ON "ButlerInvite"("token");
CREATE INDEX IF NOT EXISTS "ButlerInvite_reservationId_idx" ON "ButlerInvite"("reservationId");
