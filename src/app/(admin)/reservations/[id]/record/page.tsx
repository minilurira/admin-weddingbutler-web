import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RETENTION_DAYS, adminPreviewUrl, customerUrl, toKstInput } from "@/lib/records";
import RecordEditor, { type RecordEditorProps } from "@/components/RecordEditor";

export const dynamic = "force-dynamic";

// 서버 시간대와 무관하게 KST로 표시
function kstDate(d: Date) {
  const k = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`;
}

function kstStamp(d: Date) {
  return `${kstDate(d)} ${toKstInput(d).slice(11)}`;
}

export default async function RecordPage({ params }: { params: { id: string } }) {
  const r = await prisma.reservation.findUnique({
    where: { id: params.id },
    include: {
      recordLink: {
        include: {
          entries: { orderBy: { envelopeNo: "asc" } },
          accesses: { where: { kind: "view", viewer: "customer" }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });
  if (!r) notFound();
  const link = r.recordLink;

  const props: RecordEditorProps = {
    reservation: {
      id: r.id,
      customer: r.customer,
      couple: r.couple,
      plan: r.confirmPlan,
      dateLabel: `${r.confirmDate} ${r.confirmTime}`,
      venue: r.confirmVenue,
      butlers: r.confirmButlers,
    },
    link: link
      ? {
          status: link.status,
          url: customerUrl(link.token),
          previewUrl: adminPreviewUrl(link.token),
          version: link.version,
          publishedLabel: link.publishedAt ? kstStamp(link.publishedAt) : "",
          expiresLabel: link.expiresAt ? kstDate(link.expiresAt) : "",
          lastViewedLabel: link.accesses[0] ? kstStamp(link.accesses[0].createdAt) : "",
        }
      : null,
    initial: {
      recordMode: link?.recordMode === "sealed" ? ("sealed" as const) : ("opened" as const),
      handoverAt: toKstInput(link?.handoverAt ?? null),
      handoverEnvelopeCount: link?.handoverEnvelopeCount ?? 0,
      receiverLabel: link?.receiverLabel ?? "",
      staffCount: link?.staffCount || r.confirmButlers,
      videoUrl: link?.videoUrl ?? "",
      entries: (link?.entries ?? []).map((e) => ({
        envelopeNo: e.envelopeNo,
        side: e.side === "신부측" ? ("신부측" as const) : ("신랑측" as const),
        name: e.name,
        relation: e.relation,
        amount: e.amount,
        tickets: e.tickets,
        memo: e.memo,
      })),
    },
    retentionDays: RETENTION_DAYS,
  };

  return <RecordEditor {...props} />;
}
