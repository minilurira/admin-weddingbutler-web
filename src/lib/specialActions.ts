"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendSpecialLinkAlimtalk } from "@/lib/alimtalk";
import { sendSms } from "@/lib/sms";
import { normalizePhone } from "@/lib/lookup";
import { specialLinkText, specialLinkVariables } from "@/lib/specialLinkText";
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

/** 만든 스페셜 링크를 고객 휴대폰으로 보낸다. 알림톡을 먼저 시도하고 안 되면 문자로 보낸다. */
export async function sendSpecialLink(id: string, phone: string, name: string): Promise<{ ok: boolean; message: string }> {
  await guard();
  const to = normalizePhone(phone);
  if (!to) return { ok: false, message: "휴대폰 번호를 확인해 주세요." };
  const o = await prisma.specialOffer.findUnique({ where: { id } });
  if (!o) return { ok: false, message: "링크를 찾을 수 없습니다." };
  const state = stateOf(o);
  if (state !== "open" && state !== "held") return { ok: false, message: "이미 사용했거나 취소·만료된 링크는 보낼 수 없습니다." };
  const fields = { name: name.trim(), amount: o.amount, expiresAt: o.expiresAt, url: specialUrl(o.token) };
  const tag = `special link ${to.slice(-4)}`;
  if (await sendSpecialLinkAlimtalk(to, specialLinkVariables(fields), tag)) return { ok: true, message: "알림톡을 보냈습니다." };
  if (await sendSms(to, specialLinkText(fields), tag)) return { ok: true, message: "알림톡을 보내지 못해 문자로 보냈습니다." };
  return { ok: false, message: "발송하지 못했습니다. 링크를 복사해 직접 보내 주세요." };
}
