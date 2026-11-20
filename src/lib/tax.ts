import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

// 개인에게 주는 돈(영업대행 수수료, 버틀러 정산금)의 원천징수와 지급명세서용 인적사항.
// 주민등록번호는 PII_ENCRYPTION_KEY로 암호화해 TaxProfile 표에 둔다. 화면에는 앞 7자리만 보인다.

export * from "@/lib/taxCalc";
import { isIncomeType, type IncomeType } from "@/lib/taxCalc";

// ---------- 주민등록번호 ----------

/** 13자리 숫자와 생년월일·성별 자리만 확인한다(검증번호 규칙은 2020년 이후 번호에 맞지 않아 보지 않는다) */
export function normalizeResidentNo(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.replace(/[^0-9]/g, "");
  if (d.length !== 13) return null;
  const mm = Number(d.slice(2, 4));
  const dd = Number(d.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || !"123456789".includes(d[6])) return null;
  return d;
}

export const maskResidentNo = (d: string) => (d.length === 13 ? `${d.slice(0, 6)}-${d[6]}******` : "");

function key(): Buffer | null {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) return null;
  return crypto.createHash("sha256").update(raw).digest();
}

export const residentNoReady = () => key() !== null;
export const RESIDENT_KEY_MISSING = "주민등록번호 암호화 키(PII_ENCRYPTION_KEY)가 서버에 설정되지 않아 저장할 수 없습니다.";

function encrypt(plain: string): string {
  const k = key();
  if (!k) throw new Error(RESIDENT_KEY_MISSING);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

function decrypt(value: string): string {
  const k = key();
  if (!k || !value) return "";
  const [v, iv, tag, enc] = value.split(".");
  if (v !== "v1" || !iv || !tag || !enc) return "";
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}

// ---------- TaxProfile 표 ----------
// ownerType: "partner"(영업대행) | "butler". 마이그레이션 없이 처음 쓸 때 만든다.

const DDL = [
  `CREATE TABLE IF NOT EXISTS "TaxProfile" (
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "incomeType" TEXT NOT NULL DEFAULT '',
    "residentNoEnc" TEXT NOT NULL DEFAULT '',
    "residentNoMasked" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaxProfile_pkey" PRIMARY KEY ("ownerType", "ownerId")
  )`,
];

let ready: Promise<void> | null = null;
export function ensureTaxTables(): Promise<void> {
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

export type TaxOwner = "partner" | "butler";

export interface TaxProfileView {
  incomeType: IncomeType | "";
  residentNoMasked: string;
}

interface Row { ownerId: string; incomeType: string; residentNoMasked: string }

export async function getTaxProfiles(ownerType: TaxOwner, ids?: string[]): Promise<Map<string, TaxProfileView>> {
  await ensureTaxTables();
  const rows = ids
    ? ids.length
      ? await prisma.$queryRawUnsafe<Row[]>(`SELECT "ownerId", "incomeType", "residentNoMasked" FROM "TaxProfile" WHERE "ownerType" = $1 AND "ownerId" = ANY($2::text[])`, ownerType, ids)
      : []
    : await prisma.$queryRawUnsafe<Row[]>(`SELECT "ownerId", "incomeType", "residentNoMasked" FROM "TaxProfile" WHERE "ownerType" = $1`, ownerType);
  return new Map(rows.map((r) => [r.ownerId, { incomeType: isIncomeType(r.incomeType) ? r.incomeType : "", residentNoMasked: r.residentNoMasked }]));
}

export async function getTaxProfile(ownerType: TaxOwner, id: string): Promise<TaxProfileView> {
  return (await getTaxProfiles(ownerType, [id])).get(id) ?? { incomeType: "", residentNoMasked: "" };
}

/** 지급명세서·원천세 내역에 쓸 주민등록번호 원문 (관리자 내려받기 전용) */
export async function getResidentNo(ownerType: TaxOwner, id: string): Promise<string> {
  await ensureTaxTables();
  const rows = await prisma.$queryRawUnsafe<{ residentNoEnc: string }[]>(`SELECT "residentNoEnc" FROM "TaxProfile" WHERE "ownerType" = $1 AND "ownerId" = $2`, ownerType, id);
  return decrypt(rows[0]?.residentNoEnc ?? "");
}

export async function saveIncomeType(ownerType: TaxOwner, id: string, incomeType: IncomeType): Promise<void> {
  await ensureTaxTables();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "TaxProfile" ("ownerType", "ownerId", "incomeType") VALUES ($1, $2, $3)
     ON CONFLICT ("ownerType", "ownerId") DO UPDATE SET "incomeType" = EXCLUDED."incomeType", "updatedAt" = CURRENT_TIMESTAMP`,
    ownerType, id, incomeType
  );
}

/** 주민등록번호 저장. 형식이 틀리거나 암호화 키가 없으면 오류 문구를 던진다 */
export async function saveResidentNo(ownerType: TaxOwner, id: string, value: string): Promise<string> {
  const d = normalizeResidentNo(value);
  if (!d) throw new Error("주민등록번호 13자리를 확인해 주세요.");
  const enc = encrypt(d);
  const masked = maskResidentNo(d);
  await ensureTaxTables();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "TaxProfile" ("ownerType", "ownerId", "residentNoEnc", "residentNoMasked") VALUES ($1, $2, $3, $4)
     ON CONFLICT ("ownerType", "ownerId") DO UPDATE SET "residentNoEnc" = EXCLUDED."residentNoEnc", "residentNoMasked" = EXCLUDED."residentNoMasked", "updatedAt" = CURRENT_TIMESTAMP`,
    ownerType, id, enc, masked
  );
  return masked;
}

export async function deleteTaxProfile(ownerType: TaxOwner, id: string): Promise<void> {
  await ensureTaxTables();
  await prisma.$executeRawUnsafe(`DELETE FROM "TaxProfile" WHERE "ownerType" = $1 AND "ownerId" = $2`, ownerType, id);
}
