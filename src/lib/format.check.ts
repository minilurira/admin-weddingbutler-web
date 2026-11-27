// 실행: npx tsx src/lib/format.check.ts
import assert from "node:assert/strict";
import { sortByUpcoming } from "./format";

const r = (id: string, confirmDate: string, status = "확정", confirmTime = "13:00") => ({ id, confirmDate, confirmTime, status });
// 입력은 접수 최신순
const sorted = sortByUpcoming(
  [r("talk", "2026-11-28", "협의중"), r("past-old", "2026-10-01"), r("far", "2026-12-20"), r("new-late", "2027-03-01", "신규요청"), r("cancel", "2026-11-28", "취소"), r("new-soon", "2026-11-29", "신규요청"), r("near-pm", "2026-11-28", "확정", "15:00"), r("near-am", "2026-11-28", "확정", "9:00"), r("past-new", "2026-11-20")],
  new Date("2026-11-27T00:00:00Z"),
);
assert.deepEqual(sorted.map((x) => x.id), ["new-late", "new-soon", "talk", "near-am", "near-pm", "far", "past-new", "past-old", "cancel"]);
console.log("ok");
