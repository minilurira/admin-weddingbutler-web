import { SolapiMessageService } from "solapi";
import { ensureMessageLogTable } from "@/lib/messageLog";
import { prisma } from "@/lib/prisma";

import { logError } from "@/lib/errorLog";
// 발송 내역 화면용: 저장된 변수를 솔라피 알림톡 템플릿 본문에 채워 고객이 받은 메시지 모양으로 만든다.

export interface MessageView {
  id: string;
  kind: string;
  channel: string;
  recipient: string;
  status: string;
  detail: string;
  createdAt: string;
  /** 고객이 받은 메시지 전체. 템플릿을 불러오지 못하면 null */
  text: string | null;
  variables: Record<string, string>;
}

interface Tpl {
  header?: string | null;
  highlight?: { title?: string | null; description?: string | null } | null;
  item?: { list: { title: string; description: string }[]; summary?: { title?: string | null; description?: string | null } } | null;
  content?: string;
  extra?: string | null;
  buttons?: { buttonName?: string; linkMo?: string | null; linkPc?: string | null; linkAnd?: string | null; linkIos?: string | null }[];
}

const cache = new Map<string, { at: number; tpl: Tpl | null }>();
const TTL = 10 * 60_000;

async function template(id: string): Promise<Tpl | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.tpl;
  const key = process.env.SOLAPI_API_KEY, secret = process.env.SOLAPI_API_SECRET;
  let tpl: Tpl | null = null;
  if (key && secret && id) {
    try {
      tpl = (await new SolapiMessageService(key, secret).getKakaoAlimtalkTemplate(id)) as unknown as Tpl;
    } catch (err) {
      logError(`[messageView] could not load template ${id}`, err);
    }
  }
  if (tpl) cache.set(id, { at: Date.now(), tpl });
  return tpl;
}

const fill = (text: string, vars: Record<string, string>) => text.replace(/#\{[^}]+\}/g, (m) => vars[m] ?? m);

/** 템플릿 구조(제목, 강조, 아이템 목록, 본문, 부가정보, 버튼)를 한 덩어리 글로 펼친다. */
export function renderTemplate(tpl: Tpl, vars: Record<string, string>): string {
  const parts: string[] = [];
  if (tpl.header) parts.push(fill(tpl.header, vars));
  if (tpl.highlight?.title) parts.push([fill(tpl.highlight.title, vars), tpl.highlight.description ? fill(tpl.highlight.description, vars) : ""].filter(Boolean).join("\n"));
  if (tpl.item?.list?.length) {
    const rows = tpl.item.list.map((r) => `${fill(r.title, vars)}   ${fill(r.description, vars)}`);
    const sum = tpl.item.summary;
    if (sum?.title || sum?.description) rows.push(`${fill(sum.title ?? "", vars)}   ${fill(sum.description ?? "", vars)}`.trim());
    parts.push(rows.join("\n"));
  }
  if (tpl.content) parts.push(fill(tpl.content, vars));
  if (tpl.extra) parts.push(fill(tpl.extra, vars));
  // 버튼은 이름과 함께 연결되는 주소도 보여 준다 (주소에 변수가 들어 있으면 채운다)
  const buttons = (tpl.buttons ?? []).filter((b) => b.buttonName).map((b) => {
    const link = b.linkMo || b.linkPc || b.linkAnd || b.linkIos || "";
    return link ? `[ ${b.buttonName} ]\n${fill(link, vars)}` : `[ ${b.buttonName} ]`;
  });
  if (buttons.length) parts.push(buttons.join("\n"));
  return parts.join("\n\n");
}

export async function loadMessages(reservationId: string): Promise<MessageView[]> {
  await ensureMessageLogTable();
  const rows = await prisma.messageLog.findMany({ where: { reservationId }, orderBy: { createdAt: "desc" }, take: 50 });
  return Promise.all(
    rows.map(async (r) => {
      let variables: Record<string, string> = {};
      try { variables = JSON.parse(r.variables) as Record<string, string>; } catch { /* 깨진 값은 빈 변수로 */ }
      let text: string | null = r.content || null;
      if (!text && r.channel === "알림톡" && r.templateId && Object.keys(variables).length) {
        const tpl = await template(r.templateId);
        text = tpl ? renderTemplate(tpl, variables) : null;
      }
      return { id: r.id, kind: r.kind, channel: r.channel, recipient: r.recipient, status: r.status, detail: r.detail, createdAt: r.createdAt.toISOString(), text, variables };
    })
  );
}
