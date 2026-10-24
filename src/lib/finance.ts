import { prisma } from "@/lib/prisma";

/**
 * 정산 관리 테이블 생성문. prisma/migrations/20261024090000_add_finance/migration.sql 과 같은 내용이다.
 * 운영 DB에는 마이그레이션이 자동 적용되지 않으므로(README 참고), /finance 가 처음 열릴 때 한 번 실행해 둔다.
 * 모두 IF NOT EXISTS 라서 이미 테이블이 있거나 나중에 migrate deploy 를 돌려도 안전하다.
 */
const DDL = [
  `CREATE TABLE IF NOT EXISTS "FinanceCost" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "amount" INTEGER NOT NULL,
      "kind" TEXT NOT NULL,
      "date" TEXT NOT NULL,
      "memo" TEXT NOT NULL DEFAULT '',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "FinanceCost_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "Butler" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Butler_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "ButlerShift" (
      "id" TEXT NOT NULL,
      "butlerId" TEXT NOT NULL,
      "date" TEXT NOT NULL,
      "reservationId" TEXT NOT NULL,
      "pay" INTEGER NOT NULL,
      "paid" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ButlerShift_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ButlerShift_butlerId_fkey" FOREIGN KEY ("butlerId") REFERENCES "Butler"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "ButlerShift_date_idx" ON "ButlerShift"("date")`,
  `CREATE TABLE IF NOT EXISTS "FinanceCash" (
      "reservationId" TEXT NOT NULL,
      "amount" INTEGER NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "FinanceCash_pkey" PRIMARY KEY ("reservationId")
  )`,
  `ALTER TABLE "Butler" ADD COLUMN IF NOT EXISTS "grade" TEXT NOT NULL DEFAULT 'staff'`,
  `ALTER TABLE "ButlerShift" ADD COLUMN IF NOT EXISTS "extra" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "ButlerShift" ADD COLUMN IF NOT EXISTS "grade" TEXT NOT NULL DEFAULT 'staff'`,
  `CREATE TABLE IF NOT EXISTS "FinanceSetting" (
      "key" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      CONSTRAINT "FinanceSetting_pkey" PRIMARY KEY ("key")
  )`,
];

let ready: Promise<void> | null = null;

export function ensureFinanceTables(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const stmt of DDL) await prisma.$executeRawUnsafe(stmt);
      // 등급 도입 직후 한 번만: 이미 등록된 대표 두 명은 오너 버틀러로 맞춘다 (이후에는 화면에서 등급을 직접 바꾼다)
      await prisma.$executeRawUnsafe(`UPDATE "Butler" SET "grade" = 'owner' WHERE "name" IN ('이강', '최소연') AND NOT EXISTS (SELECT 1 FROM "FinanceSetting" WHERE "key" = 'gradeSeeded')`);
      await prisma.$executeRawUnsafe(`INSERT INTO "FinanceSetting" ("key", "value") VALUES ('gradeSeeded', '1') ON CONFLICT ("key") DO NOTHING`);
      // 참석 기록별 등급 도입 직후 한 번만: 이미 입력된 기록은 그 버틀러의 기본 등급을 이어받는다
      await prisma.$executeRawUnsafe(`UPDATE "ButlerShift" s SET "grade" = b."grade" FROM "Butler" b WHERE s."butlerId" = b."id" AND NOT EXISTS (SELECT 1 FROM "FinanceSetting" WHERE "key" = 'shiftGradeSeeded')`);
      await prisma.$executeRawUnsafe(`INSERT INTO "FinanceSetting" ("key", "value") VALUES ('shiftGradeSeeded', '1') ON CONFLICT ("key") DO NOTHING`);
    })().catch((e) => {
      ready = null; // 실패하면 다음 요청에서 다시 시도
      throw e;
    });
  }
  return ready;
}

export interface FinanceSettings {
  feeRate: number;
  bankDate: string;
  bankBalance: number;
}

const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export async function getFinanceSettings(): Promise<FinanceSettings> {
  const rows = await prisma.financeSetting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const feeRate = Number(map.feeRate);
  const bankBalance = Number(map.bankBalance);
  return {
    feeRate: Number.isFinite(feeRate) && map.feeRate !== undefined ? feeRate : 3.2, // 신용카드 3.2% (부가세 별도 계약)
    bankDate: /^\d{4}-\d{2}-\d{2}$/.test(map.bankDate ?? "") ? map.bankDate : kstToday(),
    bankBalance: Number.isFinite(bankBalance) && map.bankBalance !== undefined ? bankBalance : 0,
  };
}

/** 결제 건 대사 결과(홈페이지 /api/admin/payment-reconciliation 응답 + 어드민 예약 비교) */
export interface ReconcileRowView {
  bookingNo: string;
  dbStatus: string;
  dbAmount: number;
  createdAt: string;
  pgStatus: string;
  pgAmount: number;
  pgCancelledAmount?: number | null;
  verdict: "ok" | "mismatch" | "unpaid";
  reason: string;
  /** 테스트 거래([TEST] 이름 또는 1,000원 이하) */
  isTest?: boolean;
  /** 어드민 예약에 기록된 결제금액 (어드민에 예약이 없으면 null) */
  adminPaid?: number | null;
}

export interface ReconcileResult {
  from: string;
  until: string;
  summary: { checked: number; ok: number; unpaid: number; mismatch: number; failed: number; dbPaidTotal: number; pgPaidTotal: number; adminPaidTotal: number };
  rows: ReconcileRowView[];
  failed: { bookingNo: string; message: string }[];
}
