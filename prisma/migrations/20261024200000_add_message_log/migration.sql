-- 알림톡/문자 발송 기록. 앱이 처음 쓸 때도 같은 문장을 실행하므로(src/lib/messageLog.ts) IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS "MessageLog" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL DEFAULT '',
    "templateId" TEXT NOT NULL DEFAULT '',
    "variables" TEXT NOT NULL DEFAULT '{}',
    "content" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MessageLog_reservationId_createdAt_idx" ON "MessageLog"("reservationId", "createdAt");
