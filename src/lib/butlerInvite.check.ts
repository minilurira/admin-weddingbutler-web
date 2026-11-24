// 실행: npx tsx src/lib/butlerInvite.check.ts
import assert from "node:assert/strict";
import { inviteChangeUntil, inviteExpiry, inviteState } from "./butlerInvite";

const now = new Date("2026-11-23T01:00:00Z");
assert.equal(inviteExpiry(now, "2026-12-20").toISOString(), "2026-11-24T01:00:00.000Z"); // 24시간
assert.equal(inviteExpiry(now, "2026-11-23").toISOString(), "2026-11-23T14:59:59.000Z"); // 예식일(한국) 밤 12시까지
assert.equal(inviteState({ status: "pending", expiresAt: new Date("2026-11-23T00:59:00Z") }, now), "expired");
assert.equal(inviteState({ status: "pending", expiresAt: new Date("2026-11-24T01:00:00Z") }, now), "pending");
assert.equal(inviteState({ status: "available", expiresAt: new Date("2026-11-20T00:00:00Z") }, now), "available"); // 답한 뒤에는 기한이 지나도 그 답을 유지
assert.equal(inviteChangeUntil(new Date("2026-11-24T01:00:00Z"), "2026-12-20").toISOString(), "2026-11-25T01:00:00.000Z"); // 발송 후 48시간
assert.equal(inviteChangeUntil(new Date("2026-11-23T14:59:59Z"), "2026-11-23").toISOString(), "2026-11-23T14:59:59.000Z"); // 예식일 끝이 더 가까우면 그때까지
console.log("ok");
