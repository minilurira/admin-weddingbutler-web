// 결제 링크 안내 메시지. 알림톡 템플릿(SOLAPI_TEMPLATE_PAYMENT_LINK)에 등록한 본문과 같은 문구여야 한다 —
// 템플릿을 고치면 여기도 고친다. 문자(LMS) 대체발송도 이 본문을 쓴다.

export interface PaymentLinkFields {
  name: string;
  bookingNo: string;
  wishDate: string;
  plan: string;
  amount: number;
  expiresAt: Date;
  payUrl: string;
}

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 카카오는 항목 변수가 23자를 넘으면 거절한다(3076) */
function clip(v: string) {
  const chars = Array.from(v.trim() || "-");
  return chars.length <= 23 ? chars.join("") : chars.slice(0, 23).join("");
}

/** "10/27(화) 23:59까지" (한국 시간) */
export function expireLabel(d: Date) {
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  const hh = String(k.getUTCHours()).padStart(2, "0");
  const mm = String(k.getUTCMinutes()).padStart(2, "0");
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}(${WEEKDAYS_KO[k.getUTCDay()]}) ${hh}:${mm}까지`;
}

/** 오늘부터 days일 뒤 한국 시간 23:59:59 */
export function expiryAfterDays(days: number, now = new Date()) {
  const k = new Date(now.getTime() + KST_OFFSET_MS);
  const endKst = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() + days, 23, 59, 59);
  return new Date(endKst - KST_OFFSET_MS);
}

export function paymentLinkVariables(f: PaymentLinkFields): Record<string, string> {
  return {
    "#{name}": clip(f.name),
    "#{bookingNo}": clip(f.bookingNo),
    "#{wishDate}": clip(f.wishDate),
    "#{plan}": clip(f.plan),
    "#{amount}": clip(`${f.amount.toLocaleString("ko-KR")}원`),
    "#{expireAt}": clip(expireLabel(f.expiresAt)),
    "#{payUrl}": f.payUrl,
  };
}

export function paymentLinkText(f: PaymentLinkFields) {
  const v = paymentLinkVariables(f);
  return [
    "[웨딩버틀러] 결제 안내",
    "",
    `${v["#{name}"]}님, 웨딩버틀러 예약을 위한 결제 링크를 보내드립니다.`,
    "",
    `▶ 예약번호: ${v["#{bookingNo}"]}`,
    `▶ 예식일: ${v["#{wishDate}"]}`,
    `▶ 요금제: ${v["#{plan}"]}`,
    `▶ 결제금액: ${v["#{amount}"]}`,
    `▶ 결제기한: ${v["#{expireAt}"]}`,
    "",
    "결제기한 안에 아래 링크에서 결제해 주시면 예약이 접수됩니다.",
    f.payUrl,
    "",
    "기한이 지나면 링크가 만료되니, 다시 받으시려면 채널로 문의해 주세요.",
  ].join("\n");
}
