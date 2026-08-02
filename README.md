# ⚽ 온더볼 (On the Ball)

> 글을 쓰고 이야기를 나누는 **모바일 전용** 커뮤니티 게시판

![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-149eca?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ecf8e?logo=supabase)
![TanStack Query](https://img.shields.io/badge/TanStack_Query-5-ff4154?logo=reactquery)

---

## ✨ 기능

| 영역 | 내용 |
|---|---|
| 게시글 | 목록 · 상세 · 작성 · 수정 · 삭제(소프트). 본문은 **마크다운**(GFM) |
| 댓글 | 작성 · 삭제. 글의 `comment_count`는 DB 트리거가 관리 |
| 좋아요 | 토글(낙관적 업데이트). 동시성은 `SECURITY DEFINER` RPC의 행 잠금으로 직렬화 |
| 인증 | 이메일 회원가입 · 로그인 · 로그아웃 · 비밀번호 재설정. 에러는 한국어로 매핑 |
| 권한 | **3중 방어** — `proxy.ts` 서버 가드 → 클라이언트 가드 → **RLS + 컬럼 권한(최종)** |

> 데이터 접근에 Route Handler를 두지 않고 **브라우저가 Supabase를 직접 호출**합니다.
> 그래서 **RLS와 컬럼 권한이 유일한 방어선**이며, 마이그레이션이 곧 보안 설계입니다 —
> 자세한 규칙은 [`docs/conventions/api-and-db.md`](docs/conventions/api-and-db.md).

<details>
<summary>v1(밸런스·랭킹·유니폼·TMI·퀴즈) 청산 기록</summary>

집중할 축이 불분명해 DB 테이블·정책부터 새로 설계하기로 하고 전면 청산했습니다(2026-08-01).
청산 시점의 실사용 데이터는 0건이었습니다. 화면 9개 · 테이블 13개 · RPC 2개 등 전체 스냅샷은
[`docs/legacy/v1-inventory.md`](docs/legacy/v1-inventory.md)에, 코드 실물은 커밋 `5d02657` 이전 이력에 있습니다.

`src/shared/ui`의 일부 컴포넌트와 `shared/lib`의 포맷터 몇 개는 그때의 자산으로 **의도적으로 보존**돼 있습니다
(현재 미사용, 트리셰이킹되어 번들 비용 0). 현역/보존 구분은 [`docs/conventions/reuse.md`](docs/conventions/reuse.md).
</details>

---

## 🛠 기술 스택

| 카테고리 | 기술 |
|---|---|
| Framework | Next.js 16.2 (App Router, Turbopack) |
| Language | TypeScript 5 (strict) |
| UI | React 19 |
| Styling | Tailwind CSS v4 (`@theme` 디자인 토큰) |
| Data Fetching | TanStack Query v5 |
| Global State | zustand (세션) |
| Backend / DB | Supabase (PostgreSQL, RLS, 이메일 인증) |
| Markdown | react-markdown + remark-gfm |
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
supabase start                          # 로컬 스택 기동 (643xx 포트)
supabase db reset                       # 마이그레이션 6개 적용
bash supabase/tests/seed-users.sh       # 테스트 계정 alice/bob (비번 test1234)
pnpm dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인합니다.

> 로컬 Supabase 스택은 포트 충돌을 피하려고 표준(543xx)이 아닌 **643xx**를 씁니다 (`supabase/config.toml`).
> API 64321 / DB 64322 / Studio 64323 / **Mailpit 64324**(비밀번호 재설정 메일 확인).

> ⚠ `supabase/config.toml`의 `[auth]` 값을 바꾸면 `db reset`이 아니라 **`supabase stop && supabase start`** 가 필요합니다.

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

> env가 비어 있어도 빌드는 성공합니다. 런타임에 쿼리 훅이 한국어 안내 에러를 던집니다.

> ⚠ **CLI가 원격 프로젝트에 링크돼 있습니다.** `supabase db push`(플래그 없음)는 **원격**에 적용하고
> `db reset --linked`는 원격을 초기화합니다. 로컬 작업에는 `supabase db reset`만 쓰세요.

---

## 📁 프로젝트 구조

라우팅은 얇게(`app/`), 구현은 FSD 레이어(`src/`)로 분리합니다. 의존 방향은
`shared ← entities ← features ← widgets ← views` 단방향이며, 각 슬라이스의 `index.ts`가 public API입니다.
상세 규칙은 [`docs/conventions/`](docs/conventions/).

```
app/                     # Next.js 라우팅 전용 (view만 마운트)
├── (auth)/              #   sign-in · sign-up · forget-password (GuestOnly 셸)
├── posts/               #   목록 · new · [id] · [id]/edit
└── reset-password/      #   (auth) 밖 — 재설정 링크는 세션이 선 채로 도착한다
proxy.ts                 # 세션 쿠키 리프레시 + 낙관적 라우트 가드 (Next 16의 middleware)
src/
├── app/                 # providers(QueryClient + AuthProvider), fonts, globals.css
├── views/               # 화면 조립 8종 (⚠ pages 금지)
├── widgets/             # sub-header · tab-scroll-area · auth-shell · auth-status
├── features/            # 사용자 액션 1개 = 슬라이스 1개 (10종)
├── entities/            # session · post · comment
├── shared/              # ui / api / lib / config
└── types/               # database.types.ts (supabase 생성 — 손으로 고치지 않는다)
supabase/
├── migrations/          # 6개 (스키마 = 보안 설계)
└── tests/               # rls.sql · concurrency.sh · seed-users.sh
docs/
├── conventions/         # 코딩 컨벤션 7종
└── legacy/              # v1 인벤토리 (청산 전 스냅샷)
```

---

## 📦 스크립트

```bash
pnpm dev          # 개발 서버 실행
pnpm build        # 프로덕션 빌드
pnpm start        # 프로덕션 서버 실행
pnpm lint         # ESLint 실행
pnpm lint:fix     # ESLint 자동 수정
pnpm db:types     # 로컬 스키마 → src/types/database.types.ts 재생성 (마이그레이션 추가 후 필수)
```

---

## ✅ 검증

자동 테스트 프레임워크는 없습니다. 대신 **DB 계층에 실행 가능한 검증 스크립트**를 둡니다 —
RLS가 유일한 방어선이라 정책을 고칠 때마다 돌려야 합니다.

```bash
# RLS · 컬럼 권한 · RPC · 회귀 검사 (전체 rollback이라 DB에 흔적을 남기지 않는다)
psql "postgresql://postgres:postgres@127.0.0.1:64322/postgres" -f supabase/tests/rls.sql

# 좋아요 동시성 — N명 동시 클릭 후 like_count == count(post_like)
bash supabase/tests/concurrency.sh
```
