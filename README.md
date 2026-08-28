# ⚽ 온더볼 (On the Ball)

> 모든 축구팬들을 위한 **모바일 전용** 커뮤니티

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
| 입축구 | 운영진이 등록하는 전 유저 대상 단일 선택 문항. 코드·DB·URL에서는 `survey`다(화면 라벨만 "입축구"). **참여한 사람에게만** 결과 공개(DB 함수가 게이팅). 색을 지정한 문항은 선택지 수(2·3·4)에 따라 면적을 등분하는 **분할 카드**로 그리고 목록에서 바로 투표한다. 면 배경은 **이미지 > 색** 순으로 폴백한다. 기간은 생성 후 7일(`closes_at`)이고 마감 뒤 차단은 RLS가 한다 |
| 인증 | **카카오 · 구글 소셜 로그인**(로그인 = 가입) · 로그아웃. 에러는 한국어로 매핑 |
| 프로필 | 닉네임(가입 시 랜덤 배정 → 본인이 변경) · 프로필 사진 업로드 · **로그인 수단 연결** |
| 권한 | **3중 방어** — `proxy.ts` 서버 가드 → 클라이언트 가드 → **RLS + 컬럼 권한(최종)** |
| 검색 유입 | 목록·상세 **SSR** · 말머리별 랜딩(`/posts/category/[slug]`) · 정렬은 쿼리 + canonical · `sitemap.xml` · `robots.txt` |

> **색인 대상 화면은 전부 SSR**입니다 — 목록(글·말머리·입축구)과 상세(글·입축구) 모두
> 서버가 본문·댓글·선택지·집계를 조립해 초기 HTML에 담습니다(작성·수정·프로필처럼 색인하지
> 않는 화면만 클라이언트 쿼리). 프리페치는 최적화라 실패하면 클라이언트 조회로 폴백합니다 —
> 자세한 규약은 [`docs/conventions/nextjs.md`](docs/conventions/nextjs.md).

> 데이터 접근에 Route Handler를 두지 않고 **브라우저가 Supabase를 직접 호출**합니다.
> 그래서 **RLS와 컬럼 권한이 유일한 방어선**이며, 마이그레이션이 곧 보안 설계입니다 —
> 자세한 규칙은 [`docs/conventions/api-and-db.md`](docs/conventions/api-and-db.md).

<details>
<summary>v1(밸런스·랭킹·유니폼·TMI·퀴즈) 청산 기록</summary>

집중할 축이 불분명해 DB 테이블·정책부터 새로 설계하기로 하고 전면 청산했습니다(2026-08-01).
청산 시점의 실사용 데이터는 0건이었습니다. 화면 9개 · 테이블 13개 · RPC 2개 등 전체 스냅샷은
[`docs/legacy/v1-inventory.md`](docs/legacy/v1-inventory.md)에, 코드 실물은 커밋 `5d02657` 이전 이력에 있습니다.

그중 **단일 선택 문항(입축구) 1종만** 2026-08-23에 되살렸습니다 — 데이터 레이어는 물려받지 않고 v2 규약으로 다시 설계했습니다(결과 게이팅을 DB에, 집계 컬럼 없이, jsonb 없이).

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
| Backend / DB | Supabase (PostgreSQL, RLS, 카카오·구글 OAuth) |
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
supabase db reset                       # 마이그레이션 적용 + seed.sql 자동 실행
# 계정(alice/bob)·글·댓글은 supabase/seed.sql이 db reset 때 자동으로 넣는다
node scripts/upload-survey-images.mjs supabase/seed-images   # 입축구 면 배경 (스토리지는 SQL 밖이다)
pnpm dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인합니다.

> 로컬 Supabase 스택은 포트 충돌을 피하려고 표준(543xx)이 아닌 **643xx**를 씁니다 (`supabase/config.toml`).
> API 64321 / DB 64322 / Studio 64323 / **Mailpit 64324**(발송 메일 확인).

> ⚠ `supabase/config.toml`의 `[auth]` 값을 바꾸면 `db reset`이 아니라 **`supabase stop && supabase start`** 가 필요합니다.

---

## ⚙️ 환경 변수

`.env.example`을 복사해 `.env.local`을 만들고 값을 채웁니다.

환경 파일은 **둘**입니다 — 소셜 로그인의 **Redirect URI가 supabase 주소에서 파생**되어
환경마다 다르기 때문입니다.

| 파일 | 바라보는 곳 | 읽히는 방법 | 콘솔에 등록할 Redirect URI |
|---|---|---|---|
| `.env.local` | 로컬 스택(643xx) | 자동 (`pnpm dev`·`pnpm build`) | `http://127.0.0.1:64321/auth/v1/callback` |
| `.env.prod` | 원격 프로젝트 | **`pnpm build:prod` / `pnpm start:prod`** | `https://<project-ref>.supabase.co/auth/v1/callback` |

> ⚠ `.env.prod`는 이름을 `.env.production`으로 바꿔도 자동으로 읽히지 않습니다 —
> Next 우선순위에서 `.env.local`이 위라 로컬 값이 이깁니다. 그래서 스크립트가 명시적으로 싣습니다.

| 변수명 | 설명 | 어느 파일 | 필수 |
|---|---|---|:---:|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 둘 다 | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon(publishable) 키 | 둘 다 | ✅ |
| `NEXT_PUBLIC_SITE_URL` | `og:image` 절대 URL 기준(빌드 시점에 인라인) | 둘 다 | 배포 시 |
| `SUPABASE_SERVICE_ROLE_KEY` | 관리 작업용 (런타임 불필요) | `.env.local` | — |
| `SUPABASE_PROJECT_REF` | `supabase link`용 프로젝트 ref | `.env.local` | 배포 시 |
| `SUPABASE_DB_PASSWORD` | `supabase db push`용 DB 비밀번호 | `.env.local` | 배포 시 |
| `SUPABASE_ACCESS_TOKEN` | CLI/MCP 인증 토큰 | `.env.local` | 배포 시 |
| `SUPABASE_AUTH_EXTERNAL_KAKAO_CLIENT_ID` / `_SECRET` | 카카오 로그인 | `.env.local` | ✅ |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` | 구글 로그인 | `.env.local` | ✅ |

> `SUPABASE_*`는 전부 **`.env.local` 전용**입니다 — supabase CLI가 이 이름만 읽습니다.
> 원격의 소셜 로그인 키는 파일이 아니라 **대시보드 Authentication → Providers**가 소유합니다.

> env가 비어 있어도 빌드는 성공합니다. 런타임에 쿼리 훅이 한국어 안내 에러를 던집니다.
> 다만 **소셜 로그인 키는 로그인 자체가 유일한 인증 수단이라 필수**입니다 →
> [소셜 로그인 설정](docs/oauth-setup.md).

> ⚠ **CLI가 원격 프로젝트에 링크돼 있습니다.** 확인 프롬프트 없이 **원격**을 바꾸는 명령이 셋입니다 —
> `supabase db push`(플래그 없음) · `db reset --linked`(원격 초기화) · **`config push`**(로컬
> `config.toml`의 `[auth]`를 통째로 덮어써 Site URL이 localhost가 됩니다).
> 로컬 작업에는 `supabase db reset`만 쓰세요.

---

## 📁 프로젝트 구조

라우팅은 얇게(`app/`), 구현은 FSD 레이어(`src/`)로 분리합니다. 의존 방향은
`shared ← entities ← features ← widgets ← views` 단방향이며, 각 슬라이스의 `index.ts`가 public API입니다.
상세 규칙은 [`docs/conventions/`](docs/conventions/).

```
app/                     # Next.js 라우팅 전용 (view만 마운트)
├── (auth)/              #   sign-in (GuestOnly 셸). 소셜 로그인 복귀 지점이기도 하다
├── posts/               #   목록(list-page.tsx 공유) · category/[slug] · new · [id] · [id]/edit
├── surveys/             #   목록 · [id] (운영진 문항 — 사용자가 만드는 화면이 없다)
├── profile/             #   닉네임·사진 수정 + 계정 연결. 계정 연결의 복귀 지점
└── sitemap.ts / robots.ts  #   색인 신호 (Next 특수 파일이라 "route.ts 금지"에 걸리지 않는다)
proxy.ts                 # 세션 쿠키 리프레시 + 낙관적 라우트 가드 (Next 16의 middleware)
src/
├── app/                 # providers(QueryClient + AuthProvider), fonts, globals.css
├── views/               # 화면 조립 (⚠ pages 금지)
├── widgets/             # app-bar · bottom-tab-bar · sub-header · tab-scroll-area · auth-shell · auth-status
├── features/            # 사용자 액션 1개 = 슬라이스 1개
├── entities/            # session · post · comment · profile · poll · survey · block
├── shared/              # ui / api / lib / config
└── types/               # database.types.ts (supabase 생성 — 손으로 고치지 않는다)
supabase/
├── migrations/          # 스키마 = 보안 설계
├── seed.sql             # db reset이 자동 실행 (계정·글·댓글·좋아요·투표·입축구)
├── seed-images/         # 입축구 면 배경 (db reset이 올리지 않는다 — 위 스크립트로)
└── tests/               # run-rls.sh · rls.sql · concurrency.sh
handoff_community/       # 디자인 핸드오프 레퍼런스 (구현 대상 아님 — 린트 제외)
docs/
├── conventions/         # 코딩 컨벤션 7종
├── oauth-setup.md       # 카카오·구글 앱 등록 → 키 → 검증 절차
└── legacy/              # v1 인벤토리 (청산 전 스냅샷)
```

---

## 📦 스크립트

```bash
pnpm dev          # 개발 서버 실행
pnpm build        # 프로덕션 빌드 (.env.local — 로컬 supabase를 바라본다)
pnpm start        # 그 빌드 실행
pnpm build:prod   # .env.prod를 실어 빌드 (원격 supabase를 바라본다)
pnpm start:prod   # 그 빌드 실행
pnpm lint         # ESLint 실행
pnpm lint:fix     # ESLint 자동 수정
pnpm db:types     # 로컬 스키마 → src/types/database.types.ts 재생성 (마이그레이션 추가 후 필수)
pnpm check:conventions  # FSD 레이어·배럴·스타일 화이트리스트 검사
```

> ⚠ `build`와 `build:prod`는 **같은 `.next/`를 쓴다.** `build:prod` 뒤에 `pnpm start`를 부르면
> 원격을 바라보는 빌드가 그대로 뜬다. 로컬로 돌아올 때는 `pnpm build`를 다시 돌릴 것.

---

## ✅ 검증

자동 테스트 프레임워크는 없습니다. 대신 **DB 계층에 실행 가능한 검증 스크립트**를 둡니다 —
RLS가 유일한 방어선이라 정책을 고칠 때마다 돌려야 합니다.

```bash
# RLS · 컬럼 권한 · RPC · 회귀 검사 (전체 rollback이라 DB에 흔적을 남기지 않는다)
bash supabase/tests/run-rls.sh

# 좋아요 동시성 — N명 동시 클릭 후 like_count == count(post_like)
bash supabase/tests/concurrency.sh
```
