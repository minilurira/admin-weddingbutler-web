// 문의 답변 메시지 본문. 어드민 미리보기(클라이언트)와 문자 대체발송(서버)이 같이 쓰므로 솔라피를 import하지 않는다.
// 알림톡 템플릿(SOLAPI_TEMPLATE_INQUIRY_REPLY)에 등록한 본문과 같은 문구여야 한다 — 템플릿을 고치면 여기도 고친다.

/** 알림톡은 변수까지 채운 본문이 1,000자까지라 고정 문구·이름·주제 몫을 빼고 답변은 800자로 제한한다. */
export const INQUIRY_REPLY_MAX = 800;

export function charCount(text: string) {
  return Array.from(text).length;
}

export function inquiryReplyText(name: string, topic: string, answer: string) {
  return [
    "[웨딩버틀러] 문의 답변 안내",
    "",
    `${name}님, 웨딩버틀러에 남겨주신 문의에 답변드립니다.`,
    "",
    `■ 문의 주제: ${topic}`,
    "",
    "■ 답변",
    answer,
    "",
    "추가로 궁금하신 점은 카카오톡 채널 또는 홈페이지 문의하기로 편하게 남겨주세요.",
    "감사합니다.",
  ].join("\n");
}
