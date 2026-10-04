#!/usr/bin/env node
// 배포 승인 게이트 — run this BEFORE pushing to main (Vercel deploys main).
// The approval API lives on the homepage (weddingbutler.co.kr); this copy
// tags requests as [어드민].
//
//   APPROVAL_API_KEY=... node scripts/request-approval.mjs "변경 요약" ["상세 설명"]
//
// Sends 승인/거부 buttons to the KakaoWork group (via POST /api/approvals),
// then polls until someone answers or 30 minutes pass. Each status change is
// printed on its own line, ending with `RESOLVED:<status>`.
// Exit codes: 0 approved, 1 rejected/timeout, 2 error. Push only on 0.
//
// Env: APPROVAL_API_KEY (required, same value as on Vercel)
//      APPROVAL_API_URL (optional, default https://weddingbutler.co.kr)
//      APPROVAL_POLL_SECONDS (optional, default 5)

import { execSync } from "node:child_process";

const base = (process.env.APPROVAL_API_URL || "https://weddingbutler.co.kr").replace(/\/$/, "");
const key = process.env.APPROVAL_API_KEY;
const pollMs = Number(process.env.APPROVAL_POLL_SECONDS || 5) * 1000;
const [title, description] = process.argv.slice(2);

function done(status, code) {
  console.log(`RESOLVED:${status}`);
  process.exit(code);
}

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

async function call(path, init = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

if (!key) {
  console.error("APPROVAL_API_KEY is not set.");
  done("error", 2);
}
if (!title) {
  console.error('Usage: node scripts/request-approval.mjs "변경 요약" ["상세 설명"]');
  done("error", 2);
}

const created = await call("/api/approvals", {
  method: "POST",
  body: JSON.stringify({
    title,
    project: "admin",
    description,
    commitSha: git("rev-parse HEAD"),
    commitMessage: git("log -1 --format=%s"),
    branch: git("rev-parse --abbrev-ref HEAD"),
  }),
}).catch((err) => ({ status: 0, json: { message: String(err) } }));

if (!created.json.ok || !created.json.id) {
  console.error(`승인 요청 실패 (${created.status}): ${created.json.message ?? "unknown error"}`);
  done("error", 2);
}

const id = created.json.id;
console.log(`승인 요청을 카카오워크로 보냈습니다 (id ${id}, ${created.json.expiresAt} 만료). 응답을 기다립니다...`);

// Stop polling a little after expiry even if the server never answers.
const deadline = new Date(created.json.expiresAt).getTime() + 2 * 60 * 1000;
let failures = 0;

while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, pollMs));
  const res = await call(`/api/approvals/${id}`).catch(() => null);
  if (!res || !res.json.ok) {
    if (++failures >= 10) {
      console.error("승인 상태를 확인하지 못했습니다.");
      done("error", 2);
    }
    continue;
  }
  failures = 0;
  const { status, resolvedBy } = res.json;
  if (status === "pending") continue;
  if (status === "approved") {
    console.log(`승인됨${resolvedBy ? ` (${resolvedBy})` : ""}`);
    done("approved", 0);
  }
  console.log(status === "rejected" ? `거부됨${resolvedBy ? ` (${resolvedBy})` : ""}` : `종료: ${status}`);
  done(status, status === "error" ? 2 : 1);
}

console.log("응답 없이 시간이 지났습니다.");
done("timeout", 1);
