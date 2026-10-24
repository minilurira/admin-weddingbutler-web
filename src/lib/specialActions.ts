"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createOffer, ensureSpecialTables, specialUrl, stateOf, type OfferState } from "@/lib/special";

async function guard() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("로그인이 필요합니다.");
  await ensureSpecialTables();
}

export interface SpecialOfferView {
  id: string;
  amount: number;
  label: string;
  state: OfferState;
  url: string;
  expiresAt: string;
  bookingNo: string;
}

const view = (o: { id: string; token: string; amount: number; label: string; status: string; bookingNo: string; heldAt: Date | null; expiresAt: Date }): SpecialOfferView => ({
  id: o.id, amount: o.amount, label: o.label, state: stateOf(o), url: specialUrl(o.token), expiresAt: o.expiresAt.toISOString(), bookingNo: o.bookingNo,
});

/** 스페셜 링크 만들기: 금액과 유효기간(일)을 정하면 고객에게 보낼 링크가 생긴다. */
export async function createSpecialOffer(input: { amount: number; label: string; days: number }): Promise<SpecialOfferView> {
  await guard();
  return view(await createOffer(input));
}

export async function listSpecialOffers(): Promise<SpecialOfferView[]> {
  await guard();
  const rows = await prisma.specialOffer.findMany({ orderBy: { createdAt: "desc" }, take: 8 });
  return rows.map(view);
}

/** 아직 쓰이지 않은 링크를 취소한다. 결제가 끝난 링크는 취소할 수 없다. */
export async function cancelSpecialOffer(id: string): Promise<boolean> {
  await guard();
  const { count } = await prisma.specialOffer.updateMany({ where: { id, status: { in: ["open", "held"] } }, data: { status: "cancelled" } });
  return count === 1;
}
