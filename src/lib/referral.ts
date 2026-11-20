import { randomInt } from "node:crypto";
import type { Reservation, ReferralPartner } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { confirmTotalOf, won } from "@/lib/pricing";
import { isWeddingPast } from "@/lib/format";
import { normalizePhone } from "@/lib/lookup";
import { homepageUrl } from "@/lib/records";
import { sendSms } from "@/lib/sms";
import { logError } from "@/lib/errorLog";
import { getTaxProfile, getTaxProfiles, INCOME_TYPES, withholding, type IncomeType } from "@/lib/tax";

// 영업대행(추천) 코드. 코드로 들어온 예약의 최종 서비스 총액(온라인 + 현장 현금, 할인 반영, 환불 차감)의 5%를 코드 주인에게 준다.
// 수수료는 예식이 끝나면 "정산 가능"이 될 뿐이고, 관리자가 이체한 뒤 [정산]을 눌러야만 지급(정산 완료)으로 기록된다.

export const DEFAULT_RATE = 5;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 0/O, 1/I/L 제외
export const CODE_RE = /^[A-Z0-9]{5,12}$/;

const DDL = [
  `CREATE TABLE IF NOT EXISTS "ReferralPartner" (
    "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "phone" TEXT NOT NULL,
    "ratePercent" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "bankName" TEXT NOT NULL DEFAULT '', "accountNumber" TEXT NOT NULL DEFAULT '', "accountHolder" TEXT NOT NULL DEFAULT '',
    "accountCheckedAt" TIMESTAMP(3), "issuedBy" TEXT NOT NULL DEFAULT 'admin', "status" TEXT NOT NULL DEFAULT 'active',
    "memo" TEXT NOT NULL DEFAULT '', "agreedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralPartner_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ReferralPartner_code_key" ON "ReferralPartner"("code")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ReferralPartner_phone_key" ON "ReferralPartner"("phone")`,
  `CREATE TABLE IF NOT EXISTS "ReferralCommission" (
    "id" TEXT NOT NULL, "reservationId" TEXT NOT NULL, "partnerId" TEXT NOT NULL, "code" TEXT NOT NULL,
    "baseAmount" INTEGER NOT NULL DEFAULT 0, "ratePercent" DOUBLE PRECISION NOT NULL DEFAULT 5, "amount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending', "voidReason" TEXT NOT NULL DEFAULT '', "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralCommission_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ReferralCommission_reservationId_key" ON "ReferralCommission"("reservationId")`,
  `CREATE INDEX IF NOT EXISTS "ReferralCommission_partnerId_status_idx" ON "ReferralCommission"("partnerId", "status")`,
  `CREATE TABLE IF NOT EXISTS "ReferralPayout" (
    "id" TEXT NOT NULL, "partnerId" TEXT NOT NULL, "period" TEXT NOT NULL,
    "grossAmount" INTEGER NOT NULL, "incomeType" TEXT NOT NULL, "incomeTax" INTEGER NOT NULL DEFAULT 0, "localTax" INTEGER NOT NULL DEFAULT 0,
    "netAmount" INTEGER NOT NULL, "bankSnapshot" TEXT NOT NULL DEFAULT '', "paidAt" TIMESTAMP(3) NOT NULL, "paidBy" TEXT NOT NULL,
    "memo" TEXT NOT NULL DEFAULT '', "cancelledAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralPayout_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "ReferralPayout_partnerId_idx" ON "ReferralPayout"("partnerId")`,
  `CREATE INDEX IF NOT EXISTS "ReferralPayout_period_idx" ON "ReferralPayout"("period")`,
];

let ready: Promise<void> | null = null;
export function ensureReferralTables(): Promise<void> {
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

// ---------- 공통 도우미 ----------

export function normalizeCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const c = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return CODE_RE.test(c) ? c : null;
}

/** 홍길동 → 홍*동, 김철 → 김* */
export function maskName(name: string): string {
  const s = Array.from(name.trim());
  if (s.length <= 1) return s.join("");
  if (s.length === 2) return `${s[0]}*`;
  return `${s[0]}${"*".repeat(s.length - 2)}${s[s.length - 1]}`;
}

export const referralUrl = (code: string) => `${homepageUrl()}/?ref=${code}`;

function newCode(): string {
  let s = "WB";
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

const floorWon = (n: number) => Math.floor(n);

/** 수수료 기준 금액: 최종 서비스 총액 − 환불액 */
export function commissionBase(r: Reservation): number {
  return Math.max(0, confirmTotalOf(r) - (r.refundAmount || 0));
}

export const commissionAmount = (base: number, rate: number) => floorWon((base * rate) / 100);

export const periodOf = (r: Pick<Reservation, "confirmDate">) => (r.confirmDate || "").slice(0, 7);

export const COMMISSION_STATUS = {
  pending: { label: "예식 전", color: "#8A5A00", bg: "#FBEFD9" },
  ready: { label: "정산 가능", color: "#A8416C", bg: "#F9EFF4" },
  paid: { label: "정산 완료", color: "#2B6A45", bg: "#E3F1E8" },
  void: { label: "제외", color: "#8A8487", bg: "#EEECED" },
} as const;
export type CommissionStatus = keyof typeof COMMISSION_STATUS;

// ---------- 코드 발급 ----------

export interface IssueInput {
  name: string;
  phone: string;
  issuedBy: "self" | "admin";
  ratePercent?: number;
  memo?: string;
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
  agreed?: boolean;
}

/** 휴대폰 번호당 코드 1개. 이미 있으면 그 코드를 돌려준다(created=false). */
export async function issuePartner(input: IssueInput): Promise<{ partner: ReferralPartner; created: boolean }> {
  await ensureReferralTables();
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error("휴대폰 번호를 확인해 주세요.");
  const name = input.name.trim().slice(0, 30);
  if (!name) throw new Error("이름을 입력해 주세요.");
  const existing = await prisma.referralPartner.findUnique({ where: { phone } });
  if (existing) return { partner: existing, created: false };

  const rate = typeof input.ratePercent === "number" && input.ratePercent > 0 && input.ratePercent <= 30 ? Math.round(input.ratePercent * 10) / 10 : DEFAULT_RATE;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const partner = await prisma.referralPartner.create({
        data: {
          code: newCode(),
          name,
          phone,
          ratePercent: rate,
          issuedBy: input.issuedBy,
          memo: (input.memo ?? "").trim().slice(0, 200),
          bankName: (input.bankName ?? "").trim().slice(0, 20),
          accountNumber: (input.accountNumber ?? "").replace(/[^0-9-]/g, "").slice(0, 30),
          accountHolder: (input.accountHolder ?? "").trim().slice(0, 30),
          agreedAt: input.agreed ? new Date() : null,
        },
      });
      return { partner, created: true };
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "P2002") throw e;
      // 같은 번호가 동시에 발급된 경우
      const again = await prisma.referralPartner.findUnique({ where: { phone } });
      if (again) return { partner: again, created: false };
      // 코드가 겹쳤으면 새 코드로 다시
    }
  }
  throw new Error("코드를 만들지 못했습니다. 다시 시도해 주세요.");
}

export async function partnerByCode(code: string): Promise<ReferralPartner | null> {
  await ensureReferralTables();
  return prisma.referralPartner.findUnique({ where: { code } });
}

export function issueSmsText(p: Pick<ReferralPartner, "name" | "code" | "ratePercent">): string {
  return [
    `[웨딩버틀러] ${p.name}님, 영업대행 추천 코드가 발급되었습니다.`,
    `코드: ${p.code}`,
    `추천 링크: ${referralUrl(p.code)}`,
    `이 링크나 코드로 예약·결제한 예식이 끝나면 서비스 금액의 ${p.ratePercent}%를 다음 달 1~5일에 정산해 드립니다(원천징수 후 지급).`,
  ].join("\n");
}

export async function sendIssueSms(p: ReferralPartner): Promise<boolean> {
  return sendSms(p.phone, issueSmsText(p), `referral issue ${p.code}`);
}

// ---------- 예약 연결 ----------

export type AttachResult = { ok: true; partner: ReferralPartner } | { ok: false; reason: "not_found" | "blocked" | "self" | "paid" | "no_reservation"; message: string };

/**
 * 예약에 추천 코드를 붙인다. 본인 예약(예약 휴대폰 = 코드 주인 휴대폰)과 정지된 코드는 붙이지 않는다.
 * 이미 정산 완료된 수수료가 있는 예약은 바꾸지 않는다.
 */
export async function attachReferral(reservationId: string, rawCode: string): Promise<AttachResult> {
  await ensureReferralTables();
  const code = normalizeCode(rawCode);
  const partner = code ? await prisma.referralPartner.findUnique({ where: { code } }) : null;
  if (!partner) return { ok: false, reason: "not_found", message: "없는 추천 코드입니다." };
  if (partner.status !== "active") return { ok: false, reason: "blocked", message: "사용이 정지된 추천 코드입니다." };
  const r = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!r) return { ok: false, reason: "no_reservation", message: "예약을 찾을 수 없습니다." };
  if (normalizePhone(r.phone) === partner.phone) return { ok: false, reason: "self", message: "본인 예약에는 추천 코드를 쓸 수 없습니다." };

  const existing = await prisma.referralCommission.findUnique({ where: { reservationId } });
  if (existing?.status === "paid") return { ok: false, reason: "paid", message: "이미 정산이 끝난 예약이라 추천 코드를 바꿀 수 없습니다." };

  const base = commissionBase(r);
  const data = { partnerId: partner.id, code: partner.code, ratePercent: partner.ratePercent, baseAmount: base, amount: commissionAmount(base, partner.ratePercent), status: "pending", voidReason: "", payoutId: null };
  await prisma.referralCommission.upsert({ where: { reservationId }, create: { reservationId, ...data }, update: data });
  await refreshCommissions({ reservationIds: [reservationId] });
  return { ok: true, partner };
}

export async function detachReferral(reservationId: string): Promise<{ ok: boolean; message: string }> {
  await ensureReferralTables();
  const c = await prisma.referralCommission.findUnique({ where: { reservationId } });
  if (!c) return { ok: true, message: "연결된 추천 코드가 없습니다." };
  if (c.status === "paid") return { ok: false, message: "이미 정산이 끝난 수수료입니다. 먼저 영업대행 화면에서 정산을 취소해 주세요." };
  await prisma.referralCommission.delete({ where: { reservationId } });
  return { ok: true, message: "추천 코드를 해제했습니다." };
}

/**
 * 정산 전(pending·ready)과 예약 취소로 제외된 수수료의 상태·금액을 예약에 맞춘다.
 * 예식이 지나고 확정이면 ready(정산 가능), 취소면 void, 나머지는 pending. 지급은 하지 않는다.
 */
export async function refreshCommissions(opts: { reservationIds?: string[]; partnerId?: string } = {}): Promise<void> {
  await ensureReferralTables();
  const rows = await prisma.referralCommission.findMany({
    where: {
      ...(opts.reservationIds ? { reservationId: { in: opts.reservationIds } } : {}),
      ...(opts.partnerId ? { partnerId: opts.partnerId } : {}),
      OR: [{ status: { in: ["pending", "ready"] } }, { status: "void", voidReason: "예약 취소" }],
    },
  });
  if (!rows.length) return;
  const reservations = await prisma.reservation.findMany({ where: { id: { in: rows.map((c) => c.reservationId) } } });
  const byId = new Map(reservations.map((r) => [r.id, r]));
  for (const c of rows) {
    const r = byId.get(c.reservationId);
    let status: CommissionStatus = "pending";
    let voidReason = "";
    let base = c.baseAmount;
    if (!r) {
      status = "void";
      voidReason = "예약 삭제";
    } else if (r.status === "취소") {
      status = "void";
      voidReason = "예약 취소";
    } else {
      base = commissionBase(r);
      status = r.status === "확정" && isWeddingPast(r.confirmDate, r.confirmTime) ? "ready" : "pending";
    }
    const amount = status === "void" ? 0 : commissionAmount(base, c.ratePercent);
    if (status !== c.status || voidReason !== c.voidReason || base !== c.baseAmount || amount !== c.amount) {
      await prisma.referralCommission.update({ where: { id: c.id }, data: { status, voidReason, baseAmount: base, amount } });
    }
  }
}

// ---------- 정산 ----------

export const bankLine = (p: Pick<ReferralPartner, "bankName" | "accountNumber" | "accountHolder">) => [p.bankName, p.accountNumber, p.accountHolder].filter(Boolean).join(" ");

/** [정산]을 누를 수 없는 이유. 없으면 "" */
export function settleBlocker(p: ReferralPartner, tax: { incomeType: string; residentNoMasked: string }): string {
  if (!p.accountNumber || !p.bankName || !p.accountHolder) return "계좌 미등록";
  if (!p.accountCheckedAt) return "예금주 확인 필요";
  if (tax.incomeType !== "business" && tax.incomeType !== "other") return "소득 구분 미지정";
  if (!tax.residentNoMasked) return "주민등록번호 미등록";
  return "";
}

export interface SettleInput {
  partnerId: string;
  commissionIds: string[];
  /** 확인 창에서 고친 수수료 합계. 없으면 선택한 건의 합 */
  grossOverride?: number | null;
  memo?: string;
  paidBy: string;
}

export async function settlePartner(input: SettleInput): Promise<{ ok: boolean; message: string }> {
  await ensureReferralTables();
  const p = await prisma.referralPartner.findUnique({ where: { id: input.partnerId } });
  if (!p) return { ok: false, message: "코드 주인을 찾을 수 없습니다." };
  const tax = await getTaxProfile("partner", p.id);
  const blocker = settleBlocker(p, tax);
  if (blocker) return { ok: false, message: `정산할 수 없습니다: ${blocker}` };

  const rows = await prisma.referralCommission.findMany({ where: { id: { in: input.commissionIds }, partnerId: p.id, status: "ready" } });
  if (!rows.length || rows.length !== input.commissionIds.length) return { ok: false, message: "정산 가능한 수수료가 아닙니다. 화면을 새로고침해 주세요." };
  const reservations = await prisma.reservation.findMany({ where: { id: { in: rows.map((r) => r.reservationId) } }, select: { id: true, confirmDate: true } });
  const periods = Array.from(new Set(reservations.map(periodOf))).sort();
  const sum = rows.reduce((a, r) => a + r.amount, 0);
  const gross = typeof input.grossOverride === "number" && input.grossOverride >= 0 ? Math.floor(input.grossOverride) : sum;
  const w = withholding(tax.incomeType as IncomeType, gross);

  const payout = await prisma.$transaction(async (tx) => {
    const created = await tx.referralPayout.create({
      data: {
        partnerId: p.id,
        period: periods.join(","),
        grossAmount: w.gross,
        incomeType: tax.incomeType,
        incomeTax: w.incomeTax,
        localTax: w.localTax,
        netAmount: w.net,
        bankSnapshot: bankLine(p),
        paidAt: new Date(),
        paidBy: input.paidBy.slice(0, 40),
        memo: [(input.memo ?? "").trim().slice(0, 200), gross !== sum ? `금액 조정 ${won(sum)} → ${won(gross)}` : ""].filter(Boolean).join(" · "),
      },
    });
    const { count } = await tx.referralCommission.updateMany({ where: { id: { in: rows.map((r) => r.id) }, status: "ready" }, data: { status: "paid", payoutId: created.id } });
    if (count !== rows.length) throw new Error("다른 화면에서 먼저 정산했습니다.");
    return created;
  });

  const text = [
    `[웨딩버틀러] ${p.name}님, 추천 수수료를 정산했습니다.`,
    `수수료 ${won(payout.grossAmount)}${payout.incomeTax + payout.localTax > 0 ? ` − 원천징수 ${won(payout.incomeTax + payout.localTax)}` : ""} = 입금액 ${won(payout.netAmount)}`,
    `입금 계좌: ${payout.bankSnapshot}`,
    "소개해 주셔서 감사합니다.",
  ].join("\n");
  const sms = await sendSms(p.phone, text, `referral payout ${p.code}`).catch((e) => {
    logError("[referral] payout sms failed", e);
    return false;
  });
  return { ok: true, message: `${p.name}님 ${won(payout.netAmount)} 정산 완료로 기록했습니다.${sms ? " 안내 문자를 보냈습니다." : " 안내 문자는 보내지 못했습니다."}` };
}

export async function cancelPayout(id: string): Promise<{ ok: boolean; message: string }> {
  await ensureReferralTables();
  const p = await prisma.referralPayout.findUnique({ where: { id } });
  if (!p || p.cancelledAt) return { ok: false, message: "취소할 정산이 없습니다." };
  await prisma.$transaction([
    prisma.referralPayout.update({ where: { id }, data: { cancelledAt: new Date() } }),
    prisma.referralCommission.updateMany({ where: { payoutId: id, status: "paid" }, data: { status: "ready", payoutId: null } }),
  ]);
  return { ok: true, message: "정산을 취소했습니다. 수수료는 다시 '정산 가능'으로 돌아갔습니다." };
}

// ---------- 화면용 조회 ----------

export interface CommissionView {
  id: string;
  reservationId: string;
  customer: string;
  weddingDate: string;
  reservationStatus: string;
  baseAmount: number;
  ratePercent: number;
  amount: number;
  status: CommissionStatus;
  voidReason: string;
}

export interface PayoutView {
  id: string;
  period: string;
  grossAmount: number;
  incomeType: string;
  incomeTax: number;
  localTax: number;
  netAmount: number;
  bankSnapshot: string;
  paidAt: string;
  paidBy: string;
  memo: string;
  cancelled: boolean;
}

export interface PartnerView {
  id: string;
  code: string;
  url: string;
  name: string;
  phone: string;
  ratePercent: number;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  accountChecked: boolean;
  holderMismatch: boolean;
  issuedBy: string;
  status: string;
  memo: string;
  createdAt: string;
  incomeType: IncomeType | "";
  residentNoMasked: string;
  blocker: string;
  payoutCount: number;
  commissions: CommissionView[];
  payouts: PayoutView[];
}

const kstDate = (d: Date) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export async function loadReferralData(): Promise<PartnerView[]> {
  await ensureReferralTables();
  await refreshCommissions();
  const [partners, commissions, payouts] = await Promise.all([
    prisma.referralPartner.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.referralCommission.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.referralPayout.findMany({ orderBy: { paidAt: "desc" } }),
  ]);
  const reservations = commissions.length
    ? await prisma.reservation.findMany({ where: { id: { in: commissions.map((c) => c.reservationId) } }, select: { id: true, customer: true, confirmDate: true, status: true } })
    : [];
  const rById = new Map(reservations.map((r) => [r.id, r]));
  const taxes = await getTaxProfiles("partner", partners.map((p) => p.id));
  return partners.map((p) => {
    const tax = taxes.get(p.id) ?? { incomeType: "" as const, residentNoMasked: "" };
    const pays = payouts.filter((x) => x.partnerId === p.id);
    return {
      id: p.id,
      code: p.code,
      url: referralUrl(p.code),
      name: p.name,
      phone: p.phone,
      ratePercent: p.ratePercent,
      bankName: p.bankName,
      accountNumber: p.accountNumber,
      accountHolder: p.accountHolder,
      accountChecked: Boolean(p.accountCheckedAt),
      holderMismatch: Boolean(p.accountHolder) && p.accountHolder.replace(/\s/g, "") !== p.name.replace(/\s/g, ""),
      issuedBy: p.issuedBy,
      status: p.status,
      memo: p.memo,
      createdAt: kstDate(p.createdAt),
      incomeType: tax.incomeType,
      residentNoMasked: tax.residentNoMasked,
      blocker: settleBlocker(p, tax),
      payoutCount: pays.filter((x) => !x.cancelledAt).length,
      commissions: commissions
        .filter((c) => c.partnerId === p.id)
        .map((c) => {
          const r = rById.get(c.reservationId);
          return {
            id: c.id,
            reservationId: c.reservationId,
            customer: r?.customer ?? "(삭제된 예약)",
            weddingDate: r?.confirmDate ?? "",
            reservationStatus: r?.status ?? "",
            baseAmount: c.baseAmount,
            ratePercent: c.ratePercent,
            amount: c.amount,
            status: (c.status in COMMISSION_STATUS ? c.status : "pending") as CommissionStatus,
            voidReason: c.voidReason,
          };
        })
        .sort((a, b) => a.weddingDate.localeCompare(b.weddingDate)),
      payouts: pays.map((x) => ({
        id: x.id,
        period: x.period,
        grossAmount: x.grossAmount,
        incomeType: x.incomeType,
        incomeTax: x.incomeTax,
        localTax: x.localTax,
        netAmount: x.netAmount,
        bankSnapshot: x.bankSnapshot,
        paidAt: kstDate(x.paidAt),
        paidBy: x.paidBy,
        memo: x.memo,
        cancelled: Boolean(x.cancelledAt),
      })),
    };
  });
}

/** 예약 상세에 보여 줄 추천 정보 */
export async function reservationReferral(reservationId: string): Promise<{ code: string; name: string; amount: number; status: CommissionStatus; voidReason: string } | null> {
  try {
    await ensureReferralTables();
    await refreshCommissions({ reservationIds: [reservationId] });
    const c = await prisma.referralCommission.findUnique({ where: { reservationId } });
    if (!c) return null;
    const p = await prisma.referralPartner.findUnique({ where: { id: c.partnerId } });
    return { code: c.code, name: p?.name ?? "", amount: c.amount, status: (c.status in COMMISSION_STATUS ? c.status : "pending") as CommissionStatus, voidReason: c.voidReason };
  } catch (e) {
    logError("[referral] reservation referral load failed", e);
    return null;
  }
}

// ---------- 홈페이지 예약 조회 화면 ----------

/** 결제를 마친(취소 제외) 예약이 있는 번호만 셀프 발급할 수 있다 */
export async function selfIssueEligible(phone: string): Promise<{ eligible: boolean; name: string }> {
  const variants = new Set([phone]);
  if (phone.length === 11) variants.add(`${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`);
  if (phone.length === 10) variants.add(`${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`);
  const r = await prisma.reservation.findFirst({
    where: { phone: { in: Array.from(variants) }, status: { not: "취소" }, paidAmount: { gt: 0 } },
    orderBy: { requestedAt: "desc" },
  });
  return { eligible: Boolean(r), name: r?.customer ?? "" };
}

export interface MyReferral {
  code: string;
  url: string;
  ratePercent: number;
  status: string;
  account: { bankName: string; accountNumberMasked: string; accountHolder: string; checked: boolean } | null;
  residentNoRegistered: boolean;
  incomeTypeLabel: string;
  counts: { pending: number; ready: number; paid: number };
  expectedAmount: number;
  paidNetAmount: number;
}

export async function myReferral(phone: string): Promise<MyReferral | null> {
  await ensureReferralTables();
  const p = await prisma.referralPartner.findUnique({ where: { phone } });
  if (!p) return null;
  await refreshCommissions({ partnerId: p.id });
  const [cs, pays, tax] = await Promise.all([
    prisma.referralCommission.findMany({ where: { partnerId: p.id } }),
    prisma.referralPayout.findMany({ where: { partnerId: p.id, cancelledAt: null } }),
    getTaxProfile("partner", p.id),
  ]);
  const count = (s: string) => cs.filter((c) => c.status === s).length;
  const acct = p.accountNumber.replace(/[^0-9]/g, "");
  return {
    code: p.code,
    url: referralUrl(p.code),
    ratePercent: p.ratePercent,
    status: p.status,
    account: p.accountNumber ? { bankName: p.bankName, accountNumberMasked: acct.length > 4 ? `${"*".repeat(acct.length - 4)}${acct.slice(-4)}` : acct, accountHolder: p.accountHolder, checked: Boolean(p.accountCheckedAt) } : null,
    residentNoRegistered: Boolean(tax.residentNoMasked),
    incomeTypeLabel: tax.incomeType ? INCOME_TYPES[tax.incomeType].label : "",
    counts: { pending: count("pending"), ready: count("ready"), paid: count("paid") },
    expectedAmount: cs.filter((c) => c.status === "pending" || c.status === "ready").reduce((a, c) => a + c.amount, 0),
    paidNetAmount: pays.reduce((a, x) => a + x.netAmount, 0),
  };
}

/** 고객이 계좌를 바꾸면 예금주 확인을 다시 받는다 */
export async function updateSelfAccount(phone: string, input: { bankName: string; accountNumber: string; accountHolder: string }): Promise<void> {
  await ensureReferralTables();
  const bankName = input.bankName.trim().slice(0, 20);
  const accountNumber = input.accountNumber.replace(/[^0-9-]/g, "").slice(0, 30);
  const accountHolder = input.accountHolder.trim().slice(0, 30);
  if (!bankName || accountNumber.replace(/-/g, "").length < 8 || !accountHolder) throw new Error("은행, 계좌번호, 예금주를 모두 입력해 주세요.");
  await prisma.referralPartner.update({ where: { phone }, data: { bankName, accountNumber, accountHolder, accountCheckedAt: null } });
}
