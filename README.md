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

배포 환경(Vercel 등)에서는 `npm run build`가 `prisma migrate deploy`를 먼저 실행해 마이그레이션을 자동 적용합니다. `DATABASE_URL`, `NEXTAUTH_URL`(배포된 실제 URL), `NEXTAUTH_SECRET`을 배포 플랫폼의 환경 변수로 반드시 설정하세요 — 특히 `NEXTAUTH_URL`이 빌드 시점에 없으면 정적 페이지 생성 중 빌드가 실패합니다.

`http://localhost:3000/login` 에서 `admin` / `wb1234` 로 로그인합니다.

## 스택

- **Next.js 14 (App Router) + TypeScript** — 화면, 라우팅, Server Actions
- **Prisma + PostgreSQL** — 예약/협의기록/관리자 계정 저장 (`prisma/schema.prisma`, 마이그레이션은 `prisma/migrations/`)
- **NextAuth (Credentials)** — 다중 관리자 계정 로그인, 세션 쿠키
- **n8n 웹훅** — 확정 알림톡(카카오) 발송을 위임. 이 앱은 실제 카카오 API 키를 갖고 있지 않고, `N8N_ALIMTALK_WEBHOOK_URL` 로 설정한 n8n 워크플로우에 발송 요청만 보냅니다. n8n 쪽에서 Solapi/NHN Cloud 등 실제 알림톡 제공사 자격증명을 관리하세요. 웹훅 URL이 비어 있으면 발송을 건너뛰고 콘솔에 경고 로그만 남깁니다 (개발 중에도 안전하게 동작).

## 새 관리자 계정 추가

현재는 시드 스크립트로만 계정을 만듭니다. 추가 계정이 필요하면 `prisma/seed.ts`를 참고해 `prisma.adminUser.create(...)` 형태로 스크립트를 만들어 실행하세요 (비밀번호는 `bcryptjs`로 해시).

## 폴더 구조

- `src/app/(admin)` — 로그인 이후 화면 (대시보드/예약 리스트/캘린더) 공통 레이아웃
- `src/app/login` — 로그인 화면
- `src/lib/actions.ts` — 예약 확정/협의중 전환/메모 추가/알림톡 재발송/신규 등록 Server Actions
- `src/lib/pricing.ts` — 요금제·추가 하객/버틀러·할인 계산 로직
- `src/components/` — 사이드바, 헤더, 예약 상세, 캘린더 등 클라이언트 컴포넌트
