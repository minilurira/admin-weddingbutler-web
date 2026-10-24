// 실행: npx tsx src/lib/financeCalc.check.ts
import assert from "node:assert/strict";
import { addBusinessDays, cardFee } from "./financeCalc";

assert.equal(addBusinessDays("2026-10-20", 7), "2026-10-29"); // 화 → 21,22,23,26,27,28,29
assert.equal(addBusinessDays("2026-10-02", 1), "2026-10-06"); // 금 → 10/3 토·10/4 일·10/5 대체공휴일 건너뜀
assert.equal(addBusinessDays("2026-10-08", 2), "2026-10-13"); // 10/9 한글날과 주말 건너뜀
assert.equal(cardFee(100000, 3.2), 3520);                      // 3.2%(부가세 별도) = 3.52%
assert.equal(cardFee(450000, 3.2), 15840);
console.log("financeCalc: all checks passed");
