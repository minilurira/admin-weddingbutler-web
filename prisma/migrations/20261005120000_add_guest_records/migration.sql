-- CreateTable
CREATE TABLE "RecordLink" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "recordMode" TEXT NOT NULL DEFAULT 'opened',
    "handoverAt" TIMESTAMP(3),
    "handoverEnvelopeCount" INTEGER NOT NULL DEFAULT 0,
    "receiverLabel" TEXT NOT NULL DEFAULT '',
    "staffCount" INTEGER NOT NULL DEFAULT 0,
    "videoUrl" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordEntry" (
    "id" TEXT NOT NULL,
    "recordLinkId" TEXT NOT NULL,
    "envelopeNo" INTEGER NOT NULL,
    "side" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT NOT NULL DEFAULT '',
    "amount" INTEGER,
    "tickets" INTEGER NOT NULL DEFAULT 0,
    "memo" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "RecordEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordAccess" (
    "id" TEXT NOT NULL,
    "recordLinkId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "viewer" TEXT NOT NULL DEFAULT 'customer',
    "codeHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecordLink_reservationId_key" ON "RecordLink"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordLink_token_key" ON "RecordLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "RecordEntry_recordLinkId_envelopeNo_key" ON "RecordEntry"("recordLinkId", "envelopeNo");

-- CreateIndex
CREATE INDEX "RecordAccess_recordLinkId_kind_createdAt_idx" ON "RecordAccess"("recordLinkId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "RecordLink" ADD CONSTRAINT "RecordLink_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordEntry" ADD CONSTRAINT "RecordEntry_recordLinkId_fkey" FOREIGN KEY ("recordLinkId") REFERENCES "RecordLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordAccess" ADD CONSTRAINT "RecordAccess_recordLinkId_fkey" FOREIGN KEY ("recordLinkId") REFERENCES "RecordLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
