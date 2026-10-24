import { NextRequest, NextResponse } from "next/server";
import { sendNewReservationKakaoWorkNotice } from "@/lib/kakaowork";

export const dynamic = "force-dynamic";

// 홈페이지 문의하기가 저장(Supabase contact_messages)된 뒤 호출한다.
// 예약 알림과 같은 카카오워크 봇·대화방으로 운영팀에 알린다. 저장은 하지 않는다.
interface IncomingBody {
  name?: string;
  phone?: string;
  ceremonyDate?: string | null;
  area?: string | null;
  topic?: string | null;
  message?: string;
}

const MAX_MESSAGE = 500;

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESERVATION_API_KEY;
  if (!apiKey) {
    console.error("[api/public/inquiries] RESERVATION_API_KEY is not set on the server — refusing all requests.");
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const providedKey = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-api-key");
  if (providedKey !== apiKey) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: IncomingBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const name = body.name?.trim();
  const phone = body.phone?.trim();
  const message = body.message?.trim();
  if (!name || !phone || !message) {
    return NextResponse.json({ error: "name, phone, message are required" }, { status: 400 });
  }

  const ceremonyDate = body.ceremonyDate?.trim();
  const area = body.area?.trim();
  const shortMessage = message.length > MAX_MESSAGE ? `${message.slice(0, MAX_MESSAGE)}…` : message;

  // 짧은 단일 요청이라 응답 전에 끝까지 보낸다 (실패해도 로그만 남김).
  await sendNewReservationKakaoWorkNotice(
    [
      "신규 문의 접수",
      `고객: ${name} · ${phone}`,
      ...(ceremonyDate || area ? [`예식: ${[ceremonyDate, area].filter(Boolean).join(" · ")}`] : []),
      `유형: ${body.topic?.trim() || "기타"}`,
      `내용: ${shortMessage}`,
      "어드민 문의 관리에서 확인해 주세요.",
    ].join("\n")
  );

  return NextResponse.json({ ok: true });
}
