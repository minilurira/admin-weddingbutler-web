import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

// 예약별 알림톡/문자 발송 기록. 발송 함수(alimtalk.ts, paymentLink.ts)가 결과를 남기고, 예약 상세가 읽어 보여 준다.
// 기록은 어디까지나 보조 정보라서, 저장에 실패해도 발송 흐름은 절대 막지 않는다(recordMessage는 throw 하지 않는다).

const DDL = [
  `CREATE TABLE IF NOT EXISTS "MessageLog" (
      "id" TEXT NOT NULL,
      "reservationId" TEXT NOT NULL,
      "kind" TEXT NOT NULL,
      "channel" TEXT NOT NULL,
      "recipient" TEXT NOT NULL DEFAULT '',
      "templateId" TEXT NOT NULL DEFAULT '',
      "variables" TEXT NOT NULL DEFAULT '{}',
      "content" TEXT NOT NULL DEFAULT '',
      "status" TEXT NOT NULL,
      "detail" TEXT NOT NULL DEFAULT '',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "MessageLog_reservationId_createdAt_idx" ON "MessageLog"("reservationId", "createdAt")`,
];

let ready: Promise<void> | null = null;
export function ensureMessageLogTable(): Promise<void> {
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

export type MessageKind = "신규 예약 접수" | "직원 알림" | "예약 확정" | "7일 전 안내" | "당일 안내" | "예약 취소" | "결제 링크";
export type MessageStatus = "sent" | "failed" | "skipped";

export interface MessageEntry {
  reservationId: string;
  kind: MessageKind;
  channel: "알림톡" | "문자";
  /** 받는 번호 (직원은 maskPhone으로 가려서 넘긴다) */
  recipient: string;
  templateId?: string;
  /** 알림톡 템플릿 변수 ("#{customer}": "김OO" 형태) */
  variables?: Record<string, string>;
  /** 문자는 보낸 본문 전체 */
  content?: string;
  status: MessageStatus;
  detail?: string;
}

export async function recordMessage(e: MessageEntry): Promise<void> {
  try {
    await ensureMessageLogTable();
    await prisma.messageLog.create({
      data: {
        id: randomUUID(),
        reservationId: e.reservationId,
        kind: e.kind,
        channel: e.channel,
        recipient: e.recipient,
        templateId: e.templateId ?? "",
        variables: JSON.stringify(e.variables ?? {}),
        content: e.content ?? "",
        status: e.status,
        detail: (e.detail ?? "").slice(0, 300),
      },
    });
  } catch (err) {
    console.error(`[messageLog] could not record ${e.kind} for ${e.reservationId}`, err);
  }
}

/** 010-1234-5678 → 010-****-5678 */
export function maskPhone(phone: string): string {
  const d = phone.replace(/[^0-9]/g, "");
  return d.length >= 10 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : "****";
}
