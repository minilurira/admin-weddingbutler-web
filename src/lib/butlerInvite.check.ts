// 실행: npx tsx src/lib/butlerInvite.check.ts
import assert from "node:assert/strict";
import { inviteExpiry, inviteState } from "./butlerInvite";

const now = new Date("2026-11-23T01:00:00Z");
assert.equal(inviteExpiry(now, "2026-12-20").toISOString(), "2026-11-24T01:00:00.000Z"); // 24시간
assert.equal(inviteExpiry(now, "2026-11-23").toISOString(), "2026-11-23T14:59:59.000Z"); // 예식일(한국) 밤 12시까지
assert.equal(inviteState({ status: "pending", expiresAt: new Date("2026-11-23T00:59:00Z") }, now), "expired");
assert.equal(inviteState({ status: "pending", expiresAt: new Date("2026-11-24T01:00:00Z") }, now), "pending");
assert.equal(inviteState({ status: "accepted", expiresAt: new Date("2026-11-20T00:00:00Z") }, now), "accepted");
console.log("ok");
