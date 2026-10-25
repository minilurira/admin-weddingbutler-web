// 실행: npx tsx src/lib/extraGuest.check.ts
import assert from "node:assert/strict";
import { extraGuestDue } from "./pricing";

const base = { guestLimit: 100, billedExtraGuests: 0, paidClaim: 0 };
assert.deepEqual(extraGuestDue({ ...base, actualGuests: 130 }), { actualExtra: 30, amount: 60000 });    // 30명 × 2,000
assert.equal(extraGuestDue({ ...base, actualGuests: 90 }).amount, 0);                                    // 기준 이하
assert.equal(extraGuestDue({ ...base, billedExtraGuests: 20, actualGuests: 130 }).amount, 20000);        // 예약 때 20명분은 이미 냄
assert.equal(extraGuestDue({ ...base, billedExtraGuests: 50, actualGuests: 130 }).amount, 0);            // 덜 왔어도 환불은 없음
assert.equal(extraGuestDue({ ...base, actualGuests: 130, paidClaim: 60000 }).amount, 0);                 // 이미 결제된 차액은 다시 청구하지 않음
console.log("extraGuest: all checks passed");
