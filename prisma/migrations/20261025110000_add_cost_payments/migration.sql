-- 비용을 실제로 통장에서 지급한 달별 기록
ALTER TABLE "FinanceCost" ADD COLUMN IF NOT EXISTS "payments" TEXT NOT NULL DEFAULT '{}';
