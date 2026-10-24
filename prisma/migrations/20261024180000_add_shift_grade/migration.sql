-- 등급을 버틀러가 아니라 참석 기록마다 정한다. 앱이 /finance 를 처음 열 때도 같은 문장을 실행하므로(src/lib/finance.ts) IF NOT EXISTS.
ALTER TABLE "ButlerShift" ADD COLUMN IF NOT EXISTS "grade" TEXT NOT NULL DEFAULT 'staff';
