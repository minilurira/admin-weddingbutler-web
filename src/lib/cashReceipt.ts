import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/errorLog";
import { formatStamp } from "@/lib/format";
import { cancelCashReceipt, issueCashReceipt, PortOneV2Error, type CashReceiptKind, type IdentityType } from "@/lib/portoneV2";
import { won } from "@/lib/pricing";

// 현금으로 받은 금액과 그 현금영수증 발급 기록. 현장(현금) 잔액을 받았을 때 쓴다.
// 스키마 마이그레이션 없이 첫 사용 때 표를 만든다(MessageLog와 같은 방식).
// status: "issued" 발급됨 | "failed" 발급 실패(현금은 이미 기록됨, 다시 발급 가능) | "cancelled" 발급 취소 | "none" 영수증 없이 현금만 기록

const DDL = [
  `CREATE TABLE IF NOT EXISTS "CashReceipt" (
      "id" TEXT NOT NULL,
      "reservationId" TEXT NOT NULL,
      "paymentId" TEXT NOT NULL,
      "amount" INTEGER NOT NULL,
      "kind" TEXT NOT NULL DEFAULT '',
      "identityType" TEXT NOT NULL DEFAULT '',
      "identityNumber" TEXT NOT NULL DEFAULT '',
      "status" TEXT NOT NULL,
      "issueNumber" TEXT NOT NULL DEFAULT '',
      "url" TEXT NOT NULL DEFAULT '',
      "detail" TEXT NOT NULL DEFAULT '',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CashReceipt_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "CashReceipt_reservationId_idx" ON "CashReceipt"("reservationId")`,
];

let ready: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const stmt of DDL) await prisma.$executeRawUnsafe(stmt);
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

export interface CashReceiptRow {
  id: string;
  amount: number;
  kind: string;
  identityType: string;
  /** 화면에 보이는 가린 번호 */
  identityMasked: string;
  status: "issued" | "failed" | "cancelled" | "none";
  issueNumber: string;
  url: string;
  detail: string;
  createdLabel: string;
}

interface DbRow { id: string; reservationId: string; paymentId: string; amount: number; kind: string; identityType: string; identityNumber: string; status: string; issueNumber: string; url: string; detail: string; createdAt: Date }

/** 뒤 4자리만 남기고 가린다 (사업자번호·휴대폰 번호 공통) */
export function maskIdentity(n: string): string {
  const d = n.replace(/[^0-9]/g, "");
  return d.length <= 4 ? d : `${"*".repeat(d.length - 4)}${d.slice(-4)}`;
}

export async function listCashReceipts(reservationId: string): Promise<CashReceiptRow[]> {
  try {
    await ensureTable();
    const rows = await prisma.$queryRaw<DbRow[]>`SELECT * FROM "CashReceipt" WHERE "reservationId" = ${reservationId} ORDER BY "createdAt" DESC`;
    return rows.map((r) => ({
      id: r.id, amount: r.amount, kind: r.kind, identityType: r.identityType, identityMasked: maskIdentity(r.identityNumber),
      status: r.status as CashReceiptRow["status"], issueNumber: r.issueNumber, url: r.url, detail: r.detail, createdLabel: formatStamp(r.createdAt),
    }));
  } catch (err) {
    logError(`[cashReceipt] list failed for ${reservationId}`, err);
    return [];
  }
}

export interface ReceiveInput {
  amount: number;
  /** false면 현금만 기록하고 영수증은 발급하지 않는다 */
  issue: boolean;
  kind: CashReceiptKind;
  identityType: IdentityType;
  identityNumber: string;
}

export interface CashResult { ok: boolean; message: string }

function validate(i: ReceiveInput): string | null {
  if (!Number.isInteger(i.amount) || i.amount <= 0) return "받은 금액을 입력해 주세요.";
  if (!i.issue) return null;
  const d = i.identityNumber.replace(/[^0-9]/g, "");
  if (i.kind === "CORPORATE" && !(i.identityType === "BUSINESS" && d.length === 10)) return "지출증빙은 사업자등록번호 10자리가 필요합니다.";
  if (i.kind === "PERSONAL" && i.identityType === "PHONE" && !/^01[0-9]{8,9}$/.test(d)) return "휴대폰 번호를 확인해 주세요.";
  if (i.kind === "PERSONAL" && i.identityType === "CARD" && !(d.length >= 13 && d.length <= 19)) return "현금영수증 카드번호를 확인해 주세요.";
  return null;
}

async function issueRow(row: { id: string; paymentId: string; amount: number; kind: string; identityType: string; identityNumber: string }, orderName: string, customerName: string): Promise<CashResult> {
  try {
    const r = await issueCashReceipt({
      paymentId: row.paymentId, orderName, amount: row.amount, kind: row.kind as CashReceiptKind,
      identityNumber: row.identityNumber.replace(/[^0-9]/g, ""), identityType: row.identityType as IdentityType, customerName, paidAt: new Date(),
    });
    await prisma.$executeRaw`UPDATE "CashReceipt" SET "status" = 'issued', "issueNumber" = ${r.issueNumber}, "url" = ${r.url}, "detail" = '' WHERE "id" = ${row.id}`;
    return { ok: true, message: `현금영수증을 발급했습니다 (${won(row.amount)}).` };
  } catch (err) {
    const msg = err instanceof PortOneV2Error ? err.message : "현금영수증 발급 중 오류가 났습니다.";
    if (!(err instanceof PortOneV2Error)) logError(`[cashReceipt] issue crashed for ${row.paymentId}`, err);
    await prisma.$executeRaw`UPDATE "CashReceipt" SET "status" = 'failed', "detail" = ${msg.slice(0, 300)} WHERE "id" = ${row.id}`;
    return { ok: false, message: `${msg} 현금 ${won(row.amount)}은 이미 기록했고, 아래에서 다시 발급할 수 있습니다.` };
  }
}

/** 현금으로 받은 금액을 결제한 금액에 더하고(협의 내용에 기록), 원하면 현금영수증까지 발급한다. */
export async function receiveCash(reservationId: string, i: ReceiveInput): Promise<CashResult> {
  const bad = validate(i);
  if (bad) return { ok: false, message: bad };
  await ensureTable();
  const r = await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } });
  const id = randomUUID();
  const paymentId = `cash-${reservationId.slice(-8)}-${Date.now().toString(36)}`;
  const number = i.issue ? i.identityNumber.replace(/[^0-9]/g, "") : "";
  const row = { id, paymentId, amount: i.amount, kind: i.issue ? i.kind : "", identityType: i.issue ? i.identityType : "", identityNumber: number };
  await prisma.$executeRaw`INSERT INTO "CashReceipt" ("id","reservationId","paymentId","amount","kind","identityType","identityNumber","status") VALUES (${id}, ${reservationId}, ${paymentId}, ${i.amount}, ${row.kind}, ${row.identityType}, ${number}, ${i.issue ? "failed" : "none"})`;
  await prisma.reservation.update({ where: { id: reservationId }, data: { paidAmount: { increment: i.amount } } });
  await prisma.note.create({ data: { reservationId, text: `현금 수령 · ${won(i.amount)} · ${formatStamp(new Date())}${i.issue ? "" : " · 현금영수증 미발급"}` } });
  if (!i.issue) return { ok: true, message: `현금 ${won(i.amount)}을 기록했습니다.` };
  const res = await issueRow(row, `웨딩버틀러 축의대 대행 ${r.confirmDate}`, r.customer);
  return res.ok ? { ok: true, message: `현금 ${won(i.amount)}을 기록하고 현금영수증을 발급했습니다.` } : res;
}

/** 발급에 실패했거나 영수증 없이 기록한 현금 건을 다시 발급한다(번호는 처음 입력한 값). */
export async function retryReceipt(receiptId: string): Promise<CashResult> {
  await ensureTable();
  const [row] = await prisma.$queryRaw<DbRow[]>`SELECT * FROM "CashReceipt" WHERE "id" = ${receiptId}`;
  if (!row || row.status !== "failed") return { ok: false, message: "다시 발급할 수 있는 건이 아닙니다." };
  const r = await prisma.reservation.findUniqueOrThrow({ where: { id: row.reservationId } });
  return issueRow(row, `웨딩버틀러 축의대 대행 ${r.confirmDate}`, r.customer);
}

/** 발급한 현금영수증을 취소한다. 결제한 금액은 그대로 두니, 현금을 돌려줬다면 결제 금액은 따로 고친다. */
export async function cancelReceipt(receiptId: string): Promise<CashResult> {
  await ensureTable();
  const [row] = await prisma.$queryRaw<DbRow[]>`SELECT * FROM "CashReceipt" WHERE "id" = ${receiptId}`;
  if (!row || row.status !== "issued") return { ok: false, message: "취소할 수 있는 현금영수증이 아닙니다." };
  try {
    await cancelCashReceipt(row.paymentId);
  } catch (err) {
    return { ok: false, message: err instanceof PortOneV2Error ? err.message : "현금영수증 취소 중 오류가 났습니다." };
  }
  await prisma.$executeRaw`UPDATE "CashReceipt" SET "status" = 'cancelled' WHERE "id" = ${receiptId}`;
  await prisma.note.create({ data: { reservationId: row.reservationId, text: `현금영수증 발급 취소 · ${won(row.amount)} · ${formatStamp(new Date())}` } });
  return { ok: true, message: "현금영수증을 취소했습니다." };
}
