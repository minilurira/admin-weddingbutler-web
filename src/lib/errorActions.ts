"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { saveErrorLog, errorRoomId } from "@/lib/errorLog";
import { createErrorRoom } from "@/lib/errorRoom";

// 어드민 화면에서 난 브라우저 오류를 기록한다. 로그인한 관리자의 화면에서만 호출할 수 있다.
export async function reportClientError(message: string, where: string): Promise<void> {
  if (!(await getServerSession(authOptions))) return;
  const m = String(message ?? "").slice(0, 300);
  if (!m) return;
  await saveErrorLog("admin", `화면 ${String(where ?? "").slice(0, 100)}`, m);
}

/** 오류 알림방을 새로 만든다 (로그인한 관리자만). 이미 있으면 만들지 않는다. */
export async function createErrorRoomAction(): Promise<{ ok: boolean; message: string }> {
  if (!(await getServerSession(authOptions))) return { ok: false, message: "로그인이 필요합니다." };
  if (await errorRoomId()) return { ok: false, message: "이미 알림방이 있습니다." };
  return createErrorRoom();
}
