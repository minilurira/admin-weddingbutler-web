// 실행: npx tsx src/lib/financeCalc.check.ts
import assert from "node:assert/strict";
import { addBusinessDays, costOutflowByMonth, cardFee, gradePay, ownerPay, ownerPool, shiftTotal, splitOwnerPay } from "./financeCalc";

assert.equal(addBusinessDays("2026-10-20", 7), "2026-10-29"); // 화 → 21,22,23,26,27,28,29
assert.equal(addBusinessDays("2026-10-02", 1), "2026-10-06"); // 금 → 10/3 토·10/4 일·10/5 대체공휴일 건너뜀
assert.equal(addBusinessDays("2026-10-08", 2), "2026-10-13"); // 10/9 한글날과 주말 건너뜀
assert.equal(cardFee(100000, 3.2), 3520);                      // 3.2%(부가세 별도) = 3.52%
assert.equal(cardFee(450000, 3.2), 15840);
assert.equal(gradePay("staff"), 75000);   // 스태프 버틀러
assert.equal(gradePay("manager"), 95000); // 매니저 버틀러
assert.equal(gradePay("owner"), 150000);  // 오너 버틀러 (이강, 최소연)
assert.equal(gradePay("???"), 75000);     // 모르는 등급은 스태프
assert.equal(shiftTotal({ pay: 150000, extra: 30000 }), 180000); // 스페셜 차지는 기본 정산금에 더해진다
assert.deepEqual(splitOwnerPay(300000), { 이강: 147000, 최소연: 153000 });   // 한 건 = 150,000 × 2명 = 300,000 → 49:51
assert.deepEqual(splitOwnerPay(300000), { 이강: 147000, 최소연: 153000 });
const odd = splitOwnerPay(150001); assert.equal(odd.이강 + odd.최소연, 150001); // 반올림해도 합이 맞는다
assert.deepEqual(splitOwnerPay(0), { 이강: 0, 최소연: 0 });
const both = [{ rid: "r1", grade: "owner", pay: 150000 }, { rid: "r1", grade: "owner", pay: 150000 }];
assert.deepEqual(ownerPool(both), { count: 1, pool: 300000 });            // 두 대표를 각각 배정해도 한 건 = 300,000
assert.deepEqual(ownerPool([{ rid: "r2", grade: "owner", pay: 150000 }]), { count: 1, pool: 300000 }); // 한 분만 배정돼도 건당 300,000
assert.deepEqual(ownerPool([...both, { rid: "r2", grade: "owner", pay: 150000 }, { rid: "r3", grade: "staff", pay: 75000 }]), { count: 2, pool: 600000 });
assert.deepEqual(ownerPool([{ rid: "r1", grade: "owner", pay: 147000 }, { rid: "r1", grade: "owner", pay: 153000 }]), { count: 1, pool: 300000 }); // 49:51 두 줄도 한 건 = 300,000
assert.equal(ownerPay("이강"), 147000);
assert.equal(ownerPay("최소연"), 153000);
assert.equal(gradePay("owner", "이강"), 147000);
assert.equal(gradePay("owner", "최소연"), 153000);
assert.equal(gradePay("owner", "다른사람"), 150000);
assert.equal(gradePay("staff", "이강"), 75000);
const keys = ["2026-10", "2026-11", "2026-12"];
const rent = { kind: "monthly", amount: 100, date: "2026-09-05", payments: {} as Record<string, string> };
let o = costOutflowByMonth([rent], keys, "2026-10-10");
assert.deepEqual([o["2026-10"].mon, o["2026-11"].mon, o["2026-12"].mon], [0, 100, 100]);                     // 10/5 월세는 이미 나간 것으로 본다
o = costOutflowByMonth([{ ...rent, payments: { "2026-11": "2026-10-20" } }], keys, "2026-10-10");
assert.deepEqual([o["2026-10"].mon, o["2026-11"].mon, o["2026-12"].mon], [100, 0, 100]);                     // 11월분을 10/20에 미리 지급 → 10월에 나감
o = costOutflowByMonth([{ ...rent, payments: { "2026-10": "2026-10-05" } }], keys, "2026-10-10");
assert.equal(o["2026-10"].mon, 0);                                                                           // 기준일 전에 지급한 건은 뺀다
o = costOutflowByMonth([{ kind: "once", amount: 50, date: "2026-12-30", payments: { "2026-12": "2026-12-01" } }], keys, "2026-10-10");
assert.equal(o["2026-12"].one, 50);                                                                          // 일회성도 실제 지급일 기준
const y = costOutflowByMonth([{ ...rent, date: "2026-11-15" }], ["2026-12", "2027-01"], "2026-12-01");
assert.deepEqual([y["2026-12"].mon, y["2027-01"].mon], [100, 100]);                                          // 연도 넘김
console.log("financeCalc: all checks passed");
