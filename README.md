# ⚽ 온더볼 (On the Ball)

> 해외축구를 다루는 **모바일 전용** 커뮤니티 앱 — **재설계 진행 중**

![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-149eca?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ecf8e?logo=supabase)
![TanStack Query](https://img.shields.io/badge/TanStack_Query-5-ff4154?logo=reactquery)

---

## 🚧 현재 상태 (2026-08-01)

v1은 밸런스·랭킹·유니폼·TMI·퀴즈 5종 콘텐츠를 한 번에 담았지만, **집중할 축이 불분명해 DB 테이블·정책부터 새로 설계하기로 하고 전면 청산**했습니다.

- **기능 코드 삭제**: `app/(tabs)`·`app/(detail)`·`app/api`, `src/views`·`features`·`entities`, `widgets/app-bar`·`bottom-nav`
- **DB 청산**: 마이그레이션 3개 삭제 + 로컬 DB 리셋 → `public` 스키마 비어 있음 (테이블·뷰·함수 0)
- **v1 전체 기록**: [`docs/legacy/v1-inventory.md`](docs/legacy/v1-inventory.md) — 화면 9개 · 테이블 13개 · 집계 뷰 6개 · RPC 2개 · API 11개, 설계 판단과 폐기 사유, 남은 부채까지
- **코드 실물**: 커밋 `5d02657` 이전 이력에 남아 있어 언제든 참조·복구 가능

> ⚠️ **원격 Supabase에는 v1 스키마가 아직 남아 있습니다.** 로컬만 리셋했습니다.

### 남아 있는 기반

| 영역 | 내용 |
|---|---|
| 디자인 시스템 | `src/app/styles/globals.css`의 Tailwind v4 `@theme` 토큰, Pretendard 서브셋 92개 + JetBrains Mono |
| 공용 UI | `src/shared/ui` 18종 (Button·Pill·Icon·Flag·Shirt·Avatar·RatioBar·Skeleton·EmptyState 등) |
| 공용 로직 | `src/shared/lib`(포맷터·`cn`·`useDelayedReveal`·`useScrollRestore`), `src/shared/api`(Supabase 클라이언트·`withSupabase` 핸들러·익명 세션) |
| 셸 | `src/widgets/sub-header`·`tab-scroll-area`, `app/layout.tsx`(430px 모바일 프레임), 에러 파일 3종, `proxy.ts` |
| 문서 | `docs/conventions/` 7종 (일부는 삭제된 v1 코드를 선례로 인용 — 새 구조 확정 시 갱신 예정) |
| 원본 디자인 | `design_handoff_ontheball/` 하이파이 프로토타입 |

---

## 🛠 기술 스택

| 카테고리 | 기술 |
|---|---|
| Framework | Next.js 16.2 (App Router, Turbopack) |
| Language | TypeScript 5 (strict) |
| UI | React 19 |
| Styling | Tailwind CSS v4 (`@theme` 디자인 토큰) |
| Data Fetching | TanStack Query v5 |
| Backend / DB | Supabase (PostgreSQL, RLS, 익명 인증) |
| Validation | Zod 4 |
| Icons | lucide-react |
| Architecture | FSD (Feature-Sliced Design) |

---

## 🚀 시작하기

### 사전 요구사항

- **Node.js** 20 이상 / **pnpm** 10 이상
- **Supabase CLI** 2.6 이상 + **Docker** (로컬 DB 스택 구동용)

```bash
pnpm install
supabase start      # 로컬 스택 기동
supabase db reset   # 현재 마이그레이션 없음 → 빈 DB
pnpm dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인합니다.

> **참고:** 로컬 Supabase 스택은 포트 충돌을 피하기 위해 표준(543xx)이 아닌 **643xx** 포트를 사용합니다 (`supabase/config.toml`).

---

## ⚙️ 환경 변수

`.env.example`을 복사해 `.env.local`을 만들고 값을 채웁니다.

| 변수명 | 설명 | 필수 |
|---|---|:---:|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon(publishable) 키 | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | 관리 작업용 (런타임 불필요) | — |
| `SUPABASE_PROJECT_REF` | `supabase link`용 프로젝트 ref | 배포 시 |
| `SUPABASE_DB_PASSWORD` | `supabase db push`용 DB 비밀번호 | 배포 시 |
| `SUPABASE_ACCESS_TOKEN` | CLI/MCP 인증 토큰 | 배포 시 |

> env가 비어 있어도 빌드는 성공하며, API가 503 안내를 반환합니다.

---

## 📁 프로젝트 구조

라우팅은 얇게(`app/`), 구현은 FSD 레이어(`src/`)로 분리합니다. 의존 방향은 `shared ← entities ← features ← widgets ← views` 단방향이며, 각 슬라이스의 `index.ts`가 public API입니다. 상세 규칙은 [`docs/conventions/`](docs/conventions/).

```
app/                    # Next.js 라우팅 전용 (현재: page 플레이스홀더 + 에러 파일)
proxy.ts                # Supabase 세션 쿠키 리프레시 (Next 16의 middleware)
src/
├── app/                # FSD app 레이어: providers, fonts, globals.css
├── widgets/            # sub-header / tab-scroll-area
└── shared/             # ui / api / lib / config
supabase/
└── migrations/         # (비어 있음 — 새 스키마 설계 예정)
docs/
├── conventions/        # 코딩 컨벤션 7종
└── legacy/             # v1 인벤토리 (청산 전 스냅샷)
```

---

## 📦 스크립트

```bash
pnpm dev          # 개발 서버 실행
pnpm build        # 프로덕션 빌드
pnpm start        # 프로덕션 서버 실행
pnpm lint         # ESLint 실행
pnpm lint:fix     # ESLint 자동 수정
```

---

## 🗺 다음 단계

1. **테이블 설계** — 어떤 콘텐츠 축에 집중할지 정하고 스키마·RLS·RPC를 새로 구성
2. **기능 정의** — 화면과 API 계약을 스키마 위에 얹기
3. **컨벤션 갱신** — 새 구조에 맞춰 `docs/conventions/` 정리 (특히 `api-and-db.md`·`reuse.md`)
