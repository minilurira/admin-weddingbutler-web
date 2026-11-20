-- 영업대행(추천) 코드·수수료·정산. 운영 DB에는 src/lib/referral.ts·src/lib/tax.ts가 처음 쓸 때 같은 표를 만든다.
CREATE TABLE IF NOT EXISTS "ReferralPartner" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "ratePercent" DOUBLE PRECISION NOT NULL DEFAULT 5,
  "bankName" TEXT NOT NULL DEFAULT '',
  "accountNumber" TEXT NOT NULL DEFAULT '',
  "accountHolder" TEXT NOT NULL DEFAULT '',
  "accountCheckedAt" TIMESTAMP(3),
  "issuedBy" TEXT NOT NULL DEFAULT 'admin',
  "status" TEXT NOT NULL DEFAULT 'active',
  "memo" TEXT NOT NULL DEFAULT '',
  "agreedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralPartner_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralPartner_code_key" ON "ReferralPartner"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralPartner_phone_key" ON "ReferralPartner"("phone");

CREATE TABLE IF NOT EXISTS "ReferralCommission" (
  "id" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "baseAmount" INTEGER NOT NULL DEFAULT 0,
  "ratePercent" DOUBLE PRECISION NOT NULL DEFAULT 5,
  "amount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "voidReason" TEXT NOT NULL DEFAULT '',
  "payoutId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralCommission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralCommission_reservationId_key" ON "ReferralCommission"("reservationId");
CREATE INDEX IF NOT EXISTS "ReferralCommission_partnerId_status_idx" ON "ReferralCommission"("partnerId", "status");

CREATE TABLE IF NOT EXISTS "ReferralPayout" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "grossAmount" INTEGER NOT NULL,
  "incomeType" TEXT NOT NULL,
  "incomeTax" INTEGER NOT NULL DEFAULT 0,
  "localTax" INTEGER NOT NULL DEFAULT 0,
  "netAmount" INTEGER NOT NULL,
  "bankSnapshot" TEXT NOT NULL DEFAULT '',
  "paidAt" TIMESTAMP(3) NOT NULL,
  "paidBy" TEXT NOT NULL,
  "memo" TEXT NOT NULL DEFAULT '',
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralPayout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ReferralPayout_partnerId_idx" ON "ReferralPayout"("partnerId");
CREATE INDEX IF NOT EXISTS "ReferralPayout_period_idx" ON "ReferralPayout"("period");

-- 원천징수 소득 구분·주민등록번호(암호화) — 영업대행·버틀러 공통
CREATE TABLE IF NOT EXISTS "TaxProfile" (
  "ownerType" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "incomeType" TEXT NOT NULL DEFAULT '',
  "residentNoEnc" TEXT NOT NULL DEFAULT '',
  "residentNoMasked" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaxProfile_pkey" PRIMARY KEY ("ownerType", "ownerId")
);
