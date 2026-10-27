"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { saveErrorLog } from "@/lib/errorLog";

// 어드민 화면에서 난 브라우저 오류를 기록한다. 로그인한 관리자의 화면에서만 호출할 수 있다.
export async function reportClientError(message: string, where: string): Promise<void> {
  if (!(await getServerSession(authOptions))) return;
  const m = String(message ?? "").slice(0, 300);
  if (!m) return;
  await saveErrorLog("admin", `화면 ${String(where ?? "").slice(0, 100)}`, m);
}
