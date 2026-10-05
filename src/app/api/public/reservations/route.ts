import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { PLANS, planMeta, won } from "@/lib/pricing";
import { formatWishDateLabel } from "@/lib/format";
import { sendNewReservationAlimtalk } from "@/lib/alimtalk";
import { sendNewReservationKakaoWorkNotice } from "@/lib/kakaowork";

export const dynamic = "force-dynamic";

interface IncomingBody {
  externalId?: string;
  customer?: string;
  couple?: string;
  phone?: string;
  email?: string;
  weddingDate?: string; // "YYYY-MM-DD"
  weddingTime?: string; // "HH:MM"
  venue?: string;
  guestCount?: number;
  extraButlers?: number;
  plan?: string;
  memo?: string;
  paidAmount?: number;
}

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function generateId() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `WB-${datePart}-${suffix}`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESERVATION_API_KEY;
  if (!apiKey) {
    console.error("[api/public/reservations] RESERVATION_API_KEY is not set on the server — refusing all requests.");
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const providedKey = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-api-key");
  if (providedKey !== apiKey) return unauthorized();

  let body: IncomingBody;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid JSON body");
  }

  const { externalId, customer, couple, phone, email, weddingDate, weddingTime, venue, guestCount, extraButlers, plan, memo, paidAmount } = body;

  if (!customer?.trim()) return badRequest("customer is required");
  if (!couple?.trim()) return badRequest("couple is required");
  if (!phone?.trim()) return badRequest("phone is required");
  if (!weddingDate || !/^\d{4}-\d{2}-\d{2}$/.test(weddingDate)) return badRequest("weddingDate must be YYYY-MM-DD");
  if (!weddingTime || !/^\d{2}:\d{2}$/.test(weddingTime)) return badRequest("weddingTime must be HH:MM");
  if (!venue?.trim()) return badRequest("venue is required");
  if (typeof guestCount !== "number" || guestCount < 0) return badRequest("guestCount must be a non-negative number");
  if (extraButlers !== undefined && (!Number.isInteger(extraButlers) || extraButlers < 0)) {
    return badRequest("extraButlers must be a non-negative integer");
  }
  if (!plan || !PLANS.some((p) => p.key === plan)) {
    return badRequest(`plan must be one of: ${PLANS.map((p) => p.key).join(", ")}`);
  }

  const id = externalId?.trim() || generateId();

  const existing = await prisma.reservation.findUnique({ where: { id } });
  if (existing) {
    // Idempotent: a retried delivery of the same externalId returns the existing record instead of erroring.
    return NextResponse.json({ id: existing.id, status: existing.status, alreadyExists: true }, { status: 200 });
  }

  const meta = planMeta(plan);
  const extraGuests = Math.max(0, guestCount - meta.guestLimit);
  const requestedExtraButlers = extraButlers ?? 0;
  const resolvedPaidAmount = typeof paidAmount === "number" && paidAmount >= 0 ? paidAmount : 0;

  const created = await prisma.reservation.create({
    data: {
      id,
      customer: customer.trim(),
      couple: couple.trim(),
      phone: phone.trim(),
      email: email?.trim() ?? "",
      requestedAt: new Date(),
      wishDateLabel: formatWishDateLabel(weddingDate, weddingTime),
      venueLabel: venue.trim(),
      guestsLabel: `약 ${guestCount}명`,
      memo: memo?.trim() ?? "",
      status: "신규요청",
      requestedPlan: plan,
      requestedExtraButlers,
      confirmPlan: plan,
      confirmDate: weddingDate,
      confirmTime: weddingTime,
      confirmVenue: venue.trim(),
      confirmButlers: meta.butlers + requestedExtraButlers,
      confirmExtraGuests: extraGuests,
      confirmDiscount: 0,
      confirmHours: "",
      confirmNote: "",
      paidAmount: resolvedPaidAmount,
    },
  });

  // waitUntil keeps the serverless function alive for these until they settle,
  // since the platform can freeze execution right after the response below is
  // sent — a bare fire-and-forget call here can get cut off mid-flight.
  waitUntil(
    sendNewReservationAlimtalk({
      reservationId: created.id,
      customer: created.customer,
      couple: created.couple,
      phone: created.phone,
      wishDateLabel: created.wishDateLabel,
      venueLabel: created.venueLabel,
      guestsLabel: created.guestsLabel,
      requestedPlan: created.requestedPlan,
      planAmount: meta.base,
      paidAmount: created.paidAmount,
      confirmAmount: meta.base,
      balanceAmount: Math.max(0, meta.base - created.paidAmount),
    })
  );

  waitUntil(
    sendNewReservationKakaoWorkNotice(
      [
        `신규 예약 신청 (${created.id})`,
        `고객: ${created.customer} (${created.couple}) · ${created.phone}`,
        `예식: ${created.wishDateLabel} · ${created.venueLabel}`,
        `플랜: ${created.requestedPlan} · 결제 ${won(created.paidAmount)}`,
      ].join("\n")
    )
  );

  return NextResponse.json({ id: created.id, status: created.status }, { status: 201 });
}
