-- 버틀러 등급과 스페셜 차지. 앱이 /finance 를 처음 열 때도 같은 문장을 실행하므로(src/lib/finance.ts) IF NOT EXISTS.
ALTER TABLE "Butler" ADD COLUMN IF NOT EXISTS "grade" TEXT NOT NULL DEFAULT 'staff';
ALTER TABLE "ButlerShift" ADD COLUMN IF NOT EXISTS "extra" INTEGER NOT NULL DEFAULT 0;
