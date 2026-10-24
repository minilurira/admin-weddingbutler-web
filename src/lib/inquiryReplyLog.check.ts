// 실행: npx tsx src/lib/inquiryReplyLog.check.ts
import assert from "node:assert/strict";
import { appendReply, parseReplies, repliesPlainText } from "./inquiryReplyLog";

// 이전 방식(평문 한 건)으로 저장된 행
const legacy = { reply_text: "네 신랑님,\n예식장명과 시간 알려주세요.", replied_at: "2026-10-24T06:19:00Z", reply_channel: "문자" };
assert.deepEqual(parseReplies(legacy), [{ at: "2026-10-24T06:19:00Z", channel: "문자", text: legacy.reply_text }]);

// 다시 보내도 이전 답변이 남는다
const v1 = appendReply(legacy, { at: "2026-10-24T07:00:00Z", channel: "알림톡", text: "링크 보내드립니다." });
const rows = parseReplies({ reply_text: v1, replied_at: "x", reply_channel: "y" });
assert.equal(rows.length, 2);
assert.equal(rows[0].text, legacy.reply_text); assert.equal(rows[0].channel, "문자");
assert.equal(rows[1].channel, "알림톡");
assert.equal(parseReplies({ reply_text: appendReply({ reply_text: v1 }, { at: "t", channel: "문자", text: "세 번째" }) }).length, 3);

// 답변 없음 / "["로 시작하는 평문 / 검색용 텍스트
assert.deepEqual(parseReplies({}), []);
assert.equal(parseReplies({ reply_text: "[웨딩버틀러] 안내드립니다", replied_at: "t", reply_channel: "문자" })[0].text, "[웨딩버틀러] 안내드립니다");
assert.match(repliesPlainText({ reply_text: v1 }), /링크 보내드립니다/);
console.log("inquiryReplyLog: all checks passed");
