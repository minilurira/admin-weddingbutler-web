# 웨딩버틀러 어드민

축의대 대행 예약을 접수 → 협의 → 확정까지 관리하는 내부 어드민. Next.js (App Router) + Prisma/Postgres로 구현한 실제 동작하는 앱입니다.

`project/`와 `chats/`에는 이 앱의 기반이 된 Claude Design 프로토타입과 디자인 논의 기록이 원본 그대로 남아 있습니다 (참고용).

## 실행 방법

Postgres 인스턴스가 하나 필요합니다 (로컬 `postgres`, [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres), [Neon](https://neon.tech) 등 아무거나).

```bash
npm install
cp .env.example .env        # DATABASE_URL을 실제 Postgres 연결 문자열로 수정
npm run db:migrate          # 로컬 개발 중 스키마 변경 시 (prisma migrate dev)
npm run db:seed             # 샘플 예약 8건 + 관리자 계정(admin/wb1234) 생성
npm run dev
```

배포 환경(Vercel 등)에서는 `DATABASE_URL`, `NEXTAUTH_URL`(배포된 실제 URL), `NEXTAUTH_SECRET`을 반드시 환경 변수로 설정하세요. 이 세 값이 **Production** 환경에도 적용되어 있는지 확인하세요 — Vercel은 Production/Preview/Development 환경별로 변수를 따로 관리하므로, Preview에만 추가하면 `main`에 푸시해서 만들어지는 Production 배포에서는 빈 값으로 취급됩니다.

빌드 단계(`npm run build`)는 `prisma generate && next build`만 실행하고 마이그레이션은 적용하지 않습니다 (DATABASE_URL이 빌드 시점에 없어도 빌드가 깨지지 않도록 분리). 배포 후 실제 DB에 스키마를 적용하려면 한 번은 별도로 실행해야 합니다:

```bash
DATABASE_URL="<프로덕션 연결 문자열>" npm run db:deploy   # prisma migrate deploy
DATABASE_URL="<프로덕션 연결 문자열>" npm run db:seed     # 샘플 데이터 + admin 계정
```

로컬 머신이나 Vercel CLI(`vercel env pull`로 값을 받아와서) 어디서든 실행 가능합니다.

`http://localhost:3000/login` 에서 `admin` / `wb1234` 로 로그인합니다.

## 스택

- **Next.js 14 (App Router) + TypeScript** — 화면, 라우팅, Server Actions
- **Prisma + PostgreSQL** — 예약/협의기록/관리자 계정 저장 (`prisma/schema.prisma`, 마이그레이션은 `prisma/migrations/`)
- **NextAuth (Credentials)** — 다중 관리자 계정 로그인, 세션 쿠키
- **n8n 웹훅** — 확정 알림톡(카카오) 발송을 위임. 이 앱은 실제 카카오 API 키를 갖고 있지 않고, `N8N_ALIMTALK_WEBHOOK_URL` 로 설정한 n8n 워크플로우에 발송 요청만 보냅니다. n8n 쪽에서 Solapi/NHN Cloud 등 실제 알림톡 제공사 자격증명을 관리하세요. 웹훅 URL이 비어 있으면 발송을 건너뛰고 콘솔에 경고 로그만 남깁니다 (개발 중에도 안전하게 동작).

## 홈페이지 예약 접수 API

홈페이지에서 예약이 완료되면 아래 엔드포인트로 POST 요청을 보내면 이 어드민의 "신규요청" 목록에 바로 들어갑니다.

```
POST https://<배포 도메인>/api/public/reservations
Authorization: Bearer <RESERVATION_API_KEY>
Content-Type: application/json

{
  "externalId": "홈페이지 자체 예약번호 (선택, 있으면 재전송해도 중복 생성 안 됨)",
  "customer": "이서연",
  "couple": "박준호 · 이서연",
  "phone": "010-2847-1103",
  "weddingDate": "2026-09-19",
  "weddingTime": "12:00",
  "venue": "더채플앳청담 · 그랜드홀",
  "guestCount": 350,
  "plan": "프리미엄",
  "memo": "양가 축의대 분리 운영 희망"
}
```

- `plan`은 반드시 `스몰케어` / `스탠다드` / `프리미엄` 중 하나여야 합니다 (`src/lib/pricing.ts`의 `PLANS`).
- `RESERVATION_API_KEY` 환경 변수를 배포 환경에 설정해야 하며, 헤더의 값이 정확히 일치하지 않으면 401을 반환합니다. 이 값이 아예 설정되지 않은 배포에서는 500을 반환하고 요청을 거부합니다 (인증 없이 데이터가 들어가는 걸 막기 위함).
- 성공 시 `201`과 함께 생성된 예약의 `id`를 반환합니다. 같은 `externalId`로 재전송하면 새로 만들지 않고 기존 레코드를 `200`으로 반환합니다 (재시도에 안전).
- 필수 필드가 비어있거나 형식이 틀리면 `400`과 함께 어떤 필드가 문제인지 메시지로 알려줍니다.

## 새 관리자 계정 추가

현재는 시드 스크립트로만 계정을 만듭니다. 추가 계정이 필요하면 `prisma/seed.ts`를 참고해 `prisma.adminUser.create(...)` 형태로 스크립트를 만들어 실행하세요 (비밀번호는 `bcryptjs`로 해시).

## 폴더 구조

- `src/app/(admin)` — 로그인 이후 화면 (대시보드/예약 리스트/캘린더) 공통 레이아웃
- `src/app/login` — 로그인 화면
- `src/lib/actions.ts` — 예약 확정/협의중 전환/메모 추가/알림톡 재발송/신규 등록 Server Actions
- `src/lib/pricing.ts` — 요금제·추가 하객/버틀러·할인 계산 로직
- `src/components/` — 사이드바, 헤더, 예약 상세, 캘린더 등 클라이언트 컴포넌트
