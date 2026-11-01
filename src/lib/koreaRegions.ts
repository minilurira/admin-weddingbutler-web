// GA4는 지역명을 영어로 준다(region: "Gyeonggi-do", city: "Seongnam-si"). 대시보드에서 한글로 보이게 바꾼다.
// 목록에 없는 이름은 영어 그대로 둔다. 서울은 GA4가 구 단위로 나누지 않아 "서울" 하나로 나온다.

export const REGION_KO: Record<string, string> = {
  Seoul: "서울",
  Busan: "부산",
  Daegu: "대구",
  Incheon: "인천",
  Gwangju: "광주",
  Daejeon: "대전",
  Ulsan: "울산",
  Sejong: "세종",
  "Sejong-si": "세종",
  "Gyeonggi-do": "경기",
  "Gangwon-do": "강원",
  "Gangwon State": "강원",
  "Chungcheongbuk-do": "충북",
  "North Chungcheong": "충북",
  "Chungcheongnam-do": "충남",
  "South Chungcheong": "충남",
  "Jeollabuk-do": "전북",
  "North Jeolla": "전북",
  "Jeonbuk State": "전북",
  "Jeollanam-do": "전남",
  "South Jeolla": "전남",
  "Gyeongsangbuk-do": "경북",
  "North Gyeongsang": "경북",
  "Gyeongsangnam-do": "경남",
  "South Gyeongsang": "경남",
  "Jeju-do": "제주",
  Jeju: "제주",
};

const CITY_KO: Record<string, string> = {
  Seoul: "서울",
  Busan: "부산",
  Daegu: "대구",
  Incheon: "인천",
  Gwangju: "광주",
  Daejeon: "대전",
  Ulsan: "울산",
  Sejong: "세종",
  // 경기
  Suwon: "수원시", Seongnam: "성남시", Goyang: "고양시", Yongin: "용인시", Bucheon: "부천시", Ansan: "안산시",
  Anyang: "안양시", Namyangju: "남양주시", Hwaseong: "화성시", Pyeongtaek: "평택시", Uijeongbu: "의정부시", Siheung: "시흥시",
  Paju: "파주시", Gimpo: "김포시", Gwangmyeong: "광명시", "Gwangju-si": "광주시(경기)", Gunpo: "군포시", Hanam: "하남시",
  Osan: "오산시", Icheon: "이천시", Anseong: "안성시", Uiwang: "의왕시", Yangju: "양주시", Guri: "구리시", Pocheon: "포천시",
  Dongducheon: "동두천시", Gwacheon: "과천시", Yeoju: "여주시", Yangpyeong: "양평군", Gapyeong: "가평군", Yeoncheon: "연천군",
  // 강원
  Chuncheon: "춘천시", Wonju: "원주시", Gangneung: "강릉시", Donghae: "동해시", Sokcho: "속초시", Samcheok: "삼척시", Taebaek: "태백시",
  // 충청
  Cheongju: "청주시", Chungju: "충주시", Jecheon: "제천시", Cheonan: "천안시", Asan: "아산시", Seosan: "서산시", Dangjin: "당진시",
  Gongju: "공주시", Nonsan: "논산시", Boryeong: "보령시", Gyeryong: "계룡시",
  // 전라
  Jeonju: "전주시", Iksan: "익산시", Gunsan: "군산시", Jeongeup: "정읍시", Namwon: "남원시", Gimje: "김제시",
  Mokpo: "목포시", Yeosu: "여수시", Suncheon: "순천시", Naju: "나주시", Gwangyang: "광양시",
  // 경상
  Pohang: "포항시", Gumi: "구미시", Gyeongju: "경주시", Andong: "안동시", Gimcheon: "김천시", Yeongju: "영주시", Gyeongsan: "경산시",
  Changwon: "창원시", Gimhae: "김해시", Jinju: "진주시", Yangsan: "양산시", Geoje: "거제시", Tongyeong: "통영시", Sacheon: "사천시", Miryang: "밀양시",
  // 제주
  Jeju: "제주시", "Jeju City": "제주시", Seogwipo: "서귀포시",
};

export function regionKo(name: string) {
  return REGION_KO[name] ?? name;
}

// "Seongnam-si" / "Seongnam" / "Gapyeong-gun" 처럼 접미사가 붙어 와도 찾는다.
export function cityKo(name: string) {
  if (CITY_KO[name]) return CITY_KO[name];
  const base = name.replace(/-(si|gun|gu)$/i, "");
  return CITY_KO[base] ?? name;
}
