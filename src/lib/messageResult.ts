import { SolapiMessageService } from "solapi";
import { prisma } from "@/lib/prisma";
import { ensureMessageLogTable } from "@/lib/messageLog";
import { sendNewReservationKakaoWorkNotice } from "@/lib/kakaowork";
import { logError } from "@/lib/errorLog";

// 알림톡 최종 결과 확인.
// 솔라피 send()의 응답은 "접수됐다"는 뜻일 뿐이고, 카카오가 실제로 거절했는지(템플릿 불일치, 23자 초과 3076 등)는
// 몇 초~몇 분 뒤에 솔라피 메시지 조회로만 알 수 있다. 발송 때 변수에 "_solapiGroupId"를 남겨 두고,
// 여기서 그 그룹을 조회해 수신 완료면 "_result":"delivered"를, 실패면 status를 failed와 사유로 바꾼다.

/** 이만큼 지난 기록은 더 확인하지 않는다 (솔라피 결과는 보통 몇 분 안에 나온다) */
const CHECK_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
/** 그룹 ID를 남기기 전(2026-11-21 이전)에 보낸 기록은 지난 30일치까지 번호·시각으로 찾아 확인한다 */
const LEGACY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const BACKGROUND_INTERVAL_MS = 10 * 60 * 1000;
let lastBackground = 0;

type Stored = { messageId?: string; groupId?: string; dateCreated?: string; type?: string | null; to?: string | readonly string[]; status?: string | null; statusCode?: string | null; reason?: string | null; replacement?: boolean };

function client(): SolapiMessageService | null {
  const key = process.env.SOLAPI_API_KEY;
  const secret = process.env.SOLAPI_API_SECRET;
  return key && secret ? new SolapiMessageService(key, secret) : null;
}

const digits = (v: string) => v.replace(/[^0-9]/g, "");
const toOf = (m: Stored) => digits(Array.isArray(m.to) ? m.to.join(",") : String(m.to ?? ""));
const isPending = (m: Stored) => m.statusCode === "2000" || m.statusCode === "3000" || m.status === "PENDING" || m.status === "SENDING";

type Verdict = { kind: "pending" } | { kind: "delivered" } | { kind: "failed"; detail: string };

/** 그룹 안에서 이 기록의 받는 사람(직원은 번호가 가려져 있어 끝 4자리)에게 간 메시지를 골라 판정한다. */
function judge(list: Stored[], recipient: string, channel = "알림톡"): Verdict {
  const last4 = digits(recipient).slice(-4);
  const mine = list.filter((m) => last4 && toOf(m).endsWith(last4));
  const pool = mine.length ? mine : list.length === 1 ? list : [];
  const ata = pool.filter((m) => m.type === "ATA");
  const target = ata[0] ?? pool[0];
  if (!target || isPending(target)) return { kind: "pending" };
  if (target.statusCode === "4000") return { kind: "delivered" };
  const reason = [target.statusCode, target.reason].filter(Boolean).join(" ") || "전송 실패";
  if (channel === "문자") return { kind: "failed", detail: `문자 최종 실패: ${reason}` };
  // 알림톡이 실패하면 솔라피가 문자로 대신 보내기도 한다 (같은 그룹에 문자가 따로 생긴다)
  const sms = pool.find((m) => m.type !== "ATA" && m.statusCode === "4000");
  return { kind: "failed", detail: `카카오 최종 실패: ${reason}${sms ? " · 문자로 대체 발송됨" : target.replacement ? " · 문자 대체 발송 시도" : ""}` };
}

/** 결과를 아직 모르는 알림톡 기록을 솔라피에 물어 갱신한다. reservationId를 주면 그 예약만. 실패해도 throw 하지 않는다. */
export async function refreshMessageResults(reservationId?: string): Promise<void> {
  const svc = client();
  if (!svc) return;
  try {
    await ensureMessageLogTable();
    const rows = await prisma.messageLog.findMany({
      where: {
        ...(reservationId ? { reservationId } : {}),
        channel: { in: ["알림톡", "문자"] },
        status: "sent",
        variables: { contains: '"_solapiGroupId"' },
        NOT: { variables: { contains: '"_result"' } },
        createdAt: { gte: new Date(Date.now() - CHECK_WINDOW_MS) },
      },
      orderBy: { createdAt: "asc" },
      take: 30,
    });
    const groups = new Map<string, Stored[]>();
    for (const row of rows) {
      let vars: Record<string, string> = {};
      try { vars = JSON.parse(row.variables) as Record<string, string>; } catch { continue; }
      const groupId = vars._solapiGroupId;
      if (!groupId) continue;
      if (!groups.has(groupId)) {
        const res = await svc.getMessages({ groupId });
        groups.set(groupId, Object.values(res.messageList) as Stored[]);
      }
      const verdict = judge(groups.get(groupId)!, row.recipient, row.channel);
      if (verdict.kind === "pending") continue;
      if (verdict.kind === "delivered") {
        await prisma.messageLog.update({ where: { id: row.id }, data: { variables: JSON.stringify({ ...vars, _result: "delivered" }) } });
        continue;
      }
      await prisma.messageLog.update({
        where: { id: row.id },
        data: { status: "failed", detail: verdict.detail.slice(0, 300), variables: JSON.stringify({ ...vars, _result: "failed" }) },
      });
      await sendNewReservationKakaoWorkNotice(`${row.channel} 발송 실패 (${row.kind})\n${row.reservationId} · ${verdict.detail}\n어드민 예약 상세의 발송 내역에서 확인하세요.`);
    }
  } catch (err) {
    logError("[messageResult] could not refresh Solapi results", err);
  }
  try {
    await refreshLegacyResults(svc, reservationId);
  } catch (err) {
    logError("[messageResult] could not refresh legacy Solapi results", err);
  }
}

/** 그룹 ID 없이 저장된 과거 고객 알림톡: 받는 번호와 보낸 시각(앞 2분~뒤 10분)으로 솔라피에서 그 알림톡을 찾아 결과를 반영한다.
 * 지난 일이라 카카오워크 알림은 보내지 않는다. 직원·버틀러 기록은 번호가 가려져 있어 찾을 수 없으므로 건너뛴다.
 * 솔라피에서 못 찾으면 "_result":"notfound"를 남겨 다시 찾지 않는다. */
async function refreshLegacyResults(svc: SolapiMessageService, reservationId?: string): Promise<void> {
  const rows = await prisma.messageLog.findMany({
    where: {
      ...(reservationId ? { reservationId } : {}),
      channel: "알림톡",
      status: "sent",
      NOT: [{ variables: { contains: '"_solapiGroupId"' } }, { variables: { contains: '"_result"' } }, { recipient: { contains: "*" } }],
      createdAt: { gte: new Date(Date.now() - LEGACY_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  for (const row of rows) {
    const to = digits(row.recipient);
    if (to.length < 10) continue;
    let vars: Record<string, string> = {};
    try { vars = JSON.parse(row.variables) as Record<string, string>; } catch { continue; }
    const at = row.createdAt.getTime();
    const res = await svc.getMessages({ to, startDate: new Date(at - 2 * 60_000), endDate: new Date(at + 10 * 60_000), limit: 20 });
    const list = Object.values(res.messageList) as Stored[];
    const ata = list
      .filter((m) => m.type === "ATA")
      .sort((a, b) => Math.abs(Date.parse(a.dateCreated ?? "") - at) - Math.abs(Date.parse(b.dateCreated ?? "") - at))[0];
    if (!ata) {
      await prisma.messageLog.update({ where: { id: row.id }, data: { variables: JSON.stringify({ ...vars, _result: "notfound" }) } });
      continue;
    }
    // 같은 그룹 안의 문자 대체 발송까지 같이 보려고 그 그룹 메시지로 판정한다
    const group = ata.groupId ? (Object.values((await svc.getMessages({ groupId: ata.groupId })).messageList) as Stored[]) : [ata];
    const verdict = judge(group.some((m) => m.messageId === ata.messageId) ? group : [ata, ...group], row.recipient);
    if (verdict.kind === "pending") continue;
    await prisma.messageLog.update({
      where: { id: row.id },
      data: verdict.kind === "delivered"
        ? { variables: JSON.stringify({ ...vars, _solapiGroupId: ata.groupId ?? "", _result: "delivered" }) }
        : { status: "failed", detail: verdict.detail.slice(0, 300), variables: JSON.stringify({ ...vars, _solapiGroupId: ata.groupId ?? "", _result: "failed" }) },
    });
  }
}

/** 어드민 화면을 열 때 백그라운드로 (src/app/(admin)/layout.tsx). 서버 인스턴스마다 10분에 한 번. */
export async function autoRefreshMessageResults(): Promise<void> {
  if (Date.now() - lastBackground < BACKGROUND_INTERVAL_MS) return;
  lastBackground = Date.now();
  await refreshMessageResults();
}
