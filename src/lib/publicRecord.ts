import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isExpired } from "@/lib/records";

/** 예약번호 형식: 어드민이 만든 WB-YYYYMMDD-XXXX, 홈페이지 예약 WBYYYYMMDD-NNNN */
const RESERVATION_CODE = /^WB(?:-\d{8}-[A-Z0-9]{4}|\d{8}-\d{4})$/;

/**
 * 기록 주소의 코드(토큰 또는 예약번호)로 기록 링크를 찾고 고객이 열 수 있는 상태인지 확인한다.
 * 예약번호로 열면(알림톡 링크) 명단을 저장하기 전에도 주소가 이미 정해져 있고,
 * 아직 열려 있지 않은 기록은 "준비 중"(409 state=preparing)으로 알려 준다.
 * 관리자 열람(viewer=admin, 홈페이지가 서명을 검증한 뒤에만 붙임)은 작성 중·만료여도 연다.
 */
export async function loadOpenRecord(code: string, viewer: "customer" | "admin") {
  let link = await prisma.recordLink.findUnique({ where: { token: code }, include: { reservation: true } });
  let byReservation = false;

  if (!link && RESERVATION_CODE.test(code)) {
    byReservation = true;
    link = await prisma.recordLink.findUnique({ where: { reservationId: code }, include: { reservation: true } });
    if (!link) {
      // 기록을 아직 만들지 않은 예약: 고객에게는 "준비 중"으로 안내한다 (취소된 예약·없는 예약은 not_found)
      const r = await prisma.reservation.findUnique({ where: { id: code }, select: { status: true } });
      if (viewer === "customer" && r && r.status !== "취소") return { error: NextResponse.json({ state: "preparing" }, { status: 409 }) } as const;
      return { error: NextResponse.json({ state: "not_found" }, { status: 404 }) } as const;
    }
  }
  if (!link) return { error: NextResponse.json({ state: "not_found" }, { status: 404 }) } as const;

  if (viewer === "customer") {
    // 게시된 기록과, 게시 전이라도 실시간 공유를 켠 기록(live)은 고객이 열 수 있다
    if (link.status === "draft" && byReservation) return { error: NextResponse.json({ state: "preparing" }, { status: 409 }) } as const;
    if (link.status !== "published" && link.status !== "live") return { error: NextResponse.json({ state: "not_found" }, { status: 404 }) } as const;
    if (isExpired(link)) {
      return { error: NextResponse.json({ state: "expired", expiresAt: link.expiresAt?.toISOString() }, { status: 410 }) } as const;
    }
  }
  return { link, byReservation } as const;
}

export function viewerOf(url: string): "customer" | "admin" {
  return new URL(url).searchParams.get("viewer") === "admin" ? "admin" : "customer";
}
