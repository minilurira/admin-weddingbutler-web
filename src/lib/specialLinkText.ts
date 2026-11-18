import { expireLabel } from "@/lib/paymentLinkText";

// 스페셜 예약 링크 안내 메시지. 알림톡 템플릿(SOLAPI_TEMPLATE_SPECIAL_LINK)에 등록한 본문과 같은 문구여야 한다 —
// 템플릿을 고치면 여기도 고친다. 문자(LMS) 대체발송도 이 본문을 쓴다.

export interface SpecialLinkFields {
  name: string;
  amount: number;
  expiresAt: Date;
  url: string;
}

/** 카카오는 항목 변수가 23자를 넘으면 거절한다(3076) */
function clip(v: string) {
  return Array.from(v.trim() || "고객").slice(0, 23).join("");
}

export function specialLinkVariables(f: SpecialLinkFields): Record<string, string> {
  return {
    "#{name}": clip(f.name),
    "#{amount}": `${f.amount.toLocaleString("ko-KR")}원`,
    "#{expireAt}": expireLabel(f.expiresAt),
    "#{url}": f.url,
  };
}

export function specialLinkText(f: SpecialLinkFields) {
  const v = specialLinkVariables(f);
  return [
    "[웨딩버틀러] 예약 링크 안내",
    "",
    `${v["#{name}"]}님, 상담해 주신 내용으로 웨딩버틀러 예약 링크를 보내드립니다.`,
    "",
    `▶ 금액: ${v["#{amount}"]}`,
    `▶ 이용기한: ${v["#{expireAt}"]}`,
    "",
    "아래 링크에서 예식 날짜, 시간, 예식장을 선택하고 결제해 주시면 예약이 접수됩니다.",
    f.url,
    "",
    "기한이 지나면 링크가 만료되니, 다시 받으시려면 채널로 문의해 주세요.",
  ].join("\n");
}
