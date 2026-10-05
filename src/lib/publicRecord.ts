import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isExpired } from "@/lib/records";

/**
 * 토큰으로 기록 링크를 찾고 고객이 열 수 있는 상태인지 확인한다.
 * 관리자 열람(viewer=admin, 홈페이지가 서명을 검증한 뒤에만 붙임)은 작성 중·만료여도 연다.
 */
export async function loadOpenRecord(token: string, viewer: "customer" | "admin") {
  const link = await prisma.recordLink.findUnique({ where: { token }, include: { reservation: true } });
  if (!link) return { error: NextResponse.json({ state: "not_found" }, { status: 404 }) } as const;
  if (viewer === "customer") {
    if (link.status !== "published") return { error: NextResponse.json({ state: "not_found" }, { status: 404 }) } as const;
    if (isExpired(link)) {
      return { error: NextResponse.json({ state: "expired", expiresAt: link.expiresAt?.toISOString() }, { status: 410 }) } as const;
    }
  }
  return { link } as const;
}

export function viewerOf(url: string): "customer" | "admin" {
  return new URL(url).searchParams.get("viewer") === "admin" ? "admin" : "customer";
}
