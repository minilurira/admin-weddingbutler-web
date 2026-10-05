import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecordApiKey } from "@/lib/publicApi";
import { loadOpenRecord, viewerOf } from "@/lib/publicRecord";
import { buildRecordPayload } from "@/lib/records";

export const dynamic = "force-dynamic";

// 기록 전체(명단 포함). 홈페이지는 문자 인증을 통과한 고객이나 서명된 관리자 링크에만 이걸 부른다.
// ?log=0 이면 열람 기록을 남기지 않는다(엑셀 다운로드 등).
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const denied = requireRecordApiKey(req);
  if (denied) return denied;

  const viewer = viewerOf(req.url);
  const found = await loadOpenRecord(params.token, viewer);
  if ("error" in found) return found.error;

  const link = await prisma.recordLink.findUniqueOrThrow({
    where: { id: found.link.id },
    include: { reservation: true, entries: true },
  });

  if (new URL(req.url).searchParams.get("log") !== "0") {
    await prisma.recordAccess.create({ data: { recordLinkId: link.id, kind: "view", viewer } });
  }

  return NextResponse.json(buildRecordPayload(link));
}
