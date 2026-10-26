-- 어드민 비밀번호 찾기: 인증번호를 받을 휴대폰
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "phone" TEXT NOT NULL DEFAULT '';
