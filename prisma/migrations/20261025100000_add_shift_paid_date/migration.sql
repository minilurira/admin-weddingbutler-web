-- 버틀러 정산금을 실제로 입금한 날짜
ALTER TABLE "ButlerShift" ADD COLUMN IF NOT EXISTS "paidDate" TEXT NOT NULL DEFAULT '';
