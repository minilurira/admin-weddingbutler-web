// 문의 답변 기록. 답변을 여러 번 보내도 이전 것이 사라지지 않게, reply_text 컬럼에 JSON 배열
// [{ at, channel, text }, ...] 로 쌓는다. 컬럼 구조는 그대로라 DB 변경이 없다.
// 이전 방식(평문 하나 + replied_at / reply_channel)으로 저장된 행은 한 건짜리 기록으로 읽는다.

export interface ReplyEntry {
  at: string;
  channel: string;
  text: string;
}

interface ReplyFields {
  reply_text?: string | null;
  replied_at?: string | null;
  reply_channel?: string | null;
}

export function parseReplies(f: ReplyFields): ReplyEntry[] {
  const raw = f.reply_text;
  if (!raw) return [];
  if (raw.trimStart().startsWith("[")) {
    try {
      const arr: unknown = JSON.parse(raw);
      if (Array.isArray(arr) && arr.every((e) => e && typeof e === "object" && typeof (e as ReplyEntry).text === "string")) {
        return (arr as Partial<ReplyEntry>[]).map((e) => ({ at: e.at ?? "", channel: e.channel ?? "", text: e.text ?? "" }));
      }
    } catch {
      // 평문 답변이 "["로 시작하는 경우
    }
  }
  return [{ at: f.replied_at ?? "", channel: f.reply_channel ?? "", text: raw }];
}

/** 새 답변을 기존 기록 뒤에 붙인 reply_text 값 */
export function appendReply(f: ReplyFields, entry: ReplyEntry): string {
  return JSON.stringify([...parseReplies(f), entry]);
}

/** 검색용: 보낸 답변 본문을 모두 이어 붙인다 */
export function repliesPlainText(f: ReplyFields): string {
  return parseReplies(f).map((e) => e.text).join(" ");
}
