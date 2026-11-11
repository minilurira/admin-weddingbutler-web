-- 예약 확정 시 만든 구글 캘린더 일정 id
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "googleEventId" TEXT NOT NULL DEFAULT '';
