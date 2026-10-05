# ⚽ 온더볼 (On the Ball)

> 모든 축구팬들을 위한 **모바일 전용** 이적시장 보드

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
| 이적시장 | 프리미어리그·유럽 5대 리그 이적 딜 보드(`/transfers`)와 딜 상세(`/transfers/[id]`, 보도 타임라인). 기자·매체 보도를 매시 수집해(`scripts/sync-transfer-news.mjs`, GitHub Actions) **딜을 파생**하고, 딜에 붙은 보도만 LLM이 한국어로 한두 문장 요약한다. 리그·정렬·구단 필터는 쿼리 파라미터 + canonical이고, 첫 화면만 SSR이며 필터 전환은 서버를 부르지 않는다(주소만 바꾼다). `/`는 이 보드로 리다이렉트된다 |
| 관심 딜 | 로그인 사용자가 딜을 관심 목록에 담는다(낙관적 업데이트, 복합 PK로 멱등) |
| 인증 | **카카오 · 구글 소셜 로그인**(로그인 = 가입) · 로그아웃. 에러는 한국어로 매핑 |
| 프로필 | 닉네임(가입 시 랜덤 배정 → 본인이 변경) · 프로필 사진 업로드 · **로그인 수단 연결** |
| 권한 | **2중 방어** — 클라이언트 가드(`AuthRequired`·`GuestOnly`, 안내) → **RLS + 컬럼 권한(실제 차단)**. `proxy.ts`는 세션 쿠키 갱신만 하고 라우트 가드를 두지 않는다(판정자가 둘이면 무한 리다이렉트가 된다 — `docs/conventions/nextjs.md`) |
| 검색 유입 · 공유 | 보드·딜 상세 **SSR** · 정렬·리그는 쿼리 + canonical · `sitemap.xml` · `robots.txt` · 딜마다 그리는 공유 카드(`opengraph-image`) |
| 분석 | GA4(`NEXT_PUBLIC_GA_ID`가 있을 때만) — 이벤트는 `track`(`@/shared/lib`) 하나로 보낸다 |

> **색인 대상 화면은 전부 SSR**입니다 — 보드와 딜 상세 모두 서버가 딜·보도 타임라인을 조립해
> 초기 HTML에 담습니다(로그인·프로필처럼 색인하지 않는 화면만 클라이언트 쿼리). 프리페치는
> 최적화라 실패하면 클라이언트 조회로 폴백합니다 — 자세한 규약은 [`docs/conventions/nextjs.md`](docs/conventions/nextjs.md).

> 데이터 접근에 Route Handler를 두지 않고 **브라우저가 Supabase를 직접 호출**합니다.
> 그래서 **RLS와 컬럼 권한이 유일한 방어선**이며, 마이그레이션이 곧 보안 설계입니다 —
> 자세한 규칙은 [`docs/conventions/api-and-db.md`](docs/conventions/api-and-db.md).
> 이적 데이터(`transfer_*`)는 앱에 쓰기 경로가 없고 service_role로 도는 수집 스크립트만 씁니다.

<details>
<summary>청산 기록</summary>

- **v1(밸런스·랭킹·유니폼·TMI·퀴즈)** — 집중할 축이 불분명해 전면 청산했습니다(2026-08-01).
  전체 스냅샷은 [`docs/legacy/v1-inventory.md`](docs/legacy/v1-inventory.md)에, 코드 실물은 커밋 `5d02657` 이전 이력에 있습니다.
- **커뮤니티(글·댓글·투표·차단·신고)·입축구·승부예측·공지·어드민 백오피스** — 이적시장과 로그인·프로필만
  남기기로 하고 걷어냈습니다. 테이블·함수·enum은 마이그레이션 `20260926000001_drop_community_survey_match.sql`이
  지우고, 코드 실물은 그 커밋 이전 이력에 있습니다.
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
| Validation | 손으로 쓴 순수 함수(`validateNickname` 등) — 스키마 라이브러리 없음. DB CHECK가 실제 방어선 |
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
# 개발 계정(alice/bob)은 supabase/seed.sql이 db reset 때 자동으로 넣는다
node scripts/sync-transfer-news.mjs     # 이적 소식 수집 → 딜 파생 → 한국어 요약 (로컬 스택에 쓴다)
# 구단 엠블럼(public/crests/)은 이미 커밋돼 있어 따로 받을 필요가 없다.
#   새 구단이 생겨 빈 자리가 보이면: node scripts/fetch-team-crests.mjs --team <id> --code <code>
#   (API_FOOTBALL_KEY 필요 — 사용법은 스크립트 머리 주석)
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
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` / `NEXT_PUBLIC_NAVER_SITE_VERIFICATION` | Search Console·네이버 서치어드바이저 소유권 확인 메타(비우면 태그를 내보내지 않음). 등록 뒤 `/sitemap.xml` 제출 | `.env.prod` | 검색 등록 시 |
| `NEXT_PUBLIC_GA_ID` | GA4 측정 ID(`G-…`). 비우면 분석 스크립트를 싣지 않는다 — 운영 빌드에만 넣는다 | `.env.prod` | 분석 사용 시 |
| `SUPABASE_SERVICE_ROLE_KEY` | 운영 스크립트(`scripts/sync-transfer-news.mjs`) — 런타임에는 필요 없다 | `.env.local` | 원격 수집 시 |
| `ANTHROPIC_API_KEY` | 이적 소식 한국어 요약(LLM). 없으면 로컬 실행은 요약을 건너뛰고, `--remote` 실행은 실패로 끝난다 | `.env.local` | 원격 수집 시 |
| `API_FOOTBALL_KEY` | 구단 엠블럼 내려받기(`scripts/fetch-team-crests.mjs`) — 런타임에는 필요 없다 | `.env.local` | 엠블럼 추가 시 |
| `SUPABASE_PROJECT_REF` | `supabase link`용 프로젝트 ref | `.env.local` | 배포 시 |
| `SUPABASE_DB_PASSWORD` | `supabase db push`용 DB 비밀번호 | `.env.local` | 배포 시 |
| `SUPABASE_ACCESS_TOKEN` | CLI/MCP 인증 토큰 | `.env.local` | 배포 시 |
| `SUPABASE_AUTH_EXTERNAL_KAKAO_CLIENT_ID` / `_SECRET` | 카카오 로그인 | `.env.local` | ✅ |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` | 구글 로그인 | `.env.local` | ✅ |

> `SUPABASE_AUTH_EXTERNAL_*`·`SUPABASE_PROJECT_REF`·`SUPABASE_DB_PASSWORD`·`SUPABASE_ACCESS_TOKEN`은
> **`.env.local` 전용**입니다 — supabase CLI가 읽는 값이라 `.env.prod`에 적어도 아무 데도 가지 않습니다.
> 원격의 소셜 로그인 키는 파일이 아니라 **대시보드 Authentication → Providers**가 소유합니다.

> env가 비어 있어도 빌드는 성공합니다. 런타임에 쿼리 훅이 한국어 안내 에러를 던집니다.
> 다만 **소셜 로그인 키는 로그인 자체가 유일한 인증 수단이라 필수**입니다 →
> [소셜 로그인 설정](docs/oauth-setup.md).

> ⚠ **CLI가 원격 프로젝트에 링크돼 있습니다.** 확인 프롬프트 없이 **원격**을 바꾸는 명령이 셋입니다 —
> `supabase db push`(플래그 없음) · `db reset --linked`(원격 초기화) · **`config push`**(로컬
> `config.toml`의 `[auth]`를 통째로 덮어써 Site URL이 localhost가 됩니다).
> 로컬 작업에는 `supabase db reset`만 쓰세요.

---

## 🚀 배포 (Vercel)

호스팅은 **Vercel**, 데이터는 **원격 Supabase 프로젝트**입니다. Auth 설정은 파일이 아니라
**Supabase 대시보드**가 소유합니다 — `supabase config push`는 절대 쓰지 마세요(위 경고).

### 1. 원격 Supabase 준비

```bash
supabase login                      # SUPABASE_ACCESS_TOKEN 발급
supabase link --project-ref <ref>   # .env.local의 SUPABASE_PROJECT_REF

supabase db reset                   # ① 로컬에서 먼저 마이그레이션 건전성 확인
bash supabase/tests/run-rls.sh      #    (러너는 로컬 스택 전용입니다 — 127.0.0.1:64322 고정)

supabase db push                    # ② 원격에 마이그레이션 적용 (Storage 버킷도 여기서 생성)
supabase migration list --linked    # ③ Local/Remote 열이 일치하는지 대조
```

> 🔴 **`supabase db reset --linked`를 쓰면 원격에서 `seed.sql`이 돕니다** — 비밀번호가
> `test1234`인 테스트 계정이 생깁니다. 시드는 로컬 전용이고, `db push`는 시드를 실행하지 않습니다.

> ⚠ **`20260926000001_drop_community_survey_match.sql`은 되돌릴 수 없습니다** — 원격에 적용하는 순간
> 글·댓글·투표·예측·공지 행이 전부 사라집니다. 적용 전에 원격 DB를 백업합니다. 이 마이그레이션은
> `post-images`·`survey-images` 버킷의 **정책만** 걷습니다(호스팅 Supabase가 버킷 직접 삭제를 막습니다) —
> 버킷과 남은 파일은 대시보드(Storage)에서 비운 뒤 지웁니다. 공개 버킷이라 그 전까지는 옛 파일의 공개 URL이 열려 있습니다.

### 2. Vercel 프로젝트

| 항목 | 값 |
|---|---|
| Framework | Next.js (자동 감지) |
| Build Command | **기본 `next build`** — ⚠ `build:prod`를 쓰면 안 됩니다(`.env.prod`는 저장소에 없습니다) |
| Install Command | 자동 (`pnpm-lock.yaml`) |
| Function Region | **서울(`icn1`)** — `vercel.json`이 정합니다. Supabase 리전과 같아야 서버 조회가 태평양을 왕복하지 않습니다(`docs/conventions/nextjs.md`) |

**환경변수는 아래 표가 전부입니다.** 앱에서 `process.env`를 읽는 곳은 `src/shared/config/env.ts` 하나이고,
운영 스크립트는 `scripts/lib/sync-db.mjs`가 읽습니다(Vercel이 아니라 GitHub Actions 시크릿으로 받습니다).

| 키 | 범위 | 없으면 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production + Preview | 모든 조회가 "서비스 설정이 완료되지 않았어요."(빌드는 성공합니다) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production + Preview | 〃 |
| `NEXT_PUBLIC_SITE_URL` | **Production만** | Preview는 비워 둬야 `VERCEL_URL` 폴백이 배포별 도메인을 잡습니다 |
| `NEXT_PUBLIC_GA_ID` | **Production만** | 분석이 꺼집니다(스크립트를 싣지 않습니다). Preview에 넣으면 시험 클릭이 운영 수치에 섞입니다 |

> ⚠ **`NEXT_PUBLIC_*`는 빌드 시점에 인라인됩니다** — 값을 바꾸면 **반드시 재배포**해야 합니다.
> `NEXT_PUBLIC_SITE_URL`이 도메인 확정 전에 정해져야 하므로, Import 화면에서 프로젝트 이름을
> 먼저 정하고 그 자리에서 `https://<이름>.vercel.app`을 넣은 뒤 첫 배포를 돌립니다.

> ⚠ **`SUPABASE_AUTH_EXTERNAL_*`·`SUPABASE_PROJECT_REF`·`SUPABASE_DB_PASSWORD`·
> `SUPABASE_ACCESS_TOKEN`·`SUPABASE_SERVICE_ROLE_KEY`는 Vercel에 넣지 않습니다** — 소셜 로그인 키는
> 대시보드가, CLI 값은 로컬이, service_role은 수집 워크플로의 시크릿이 소유합니다. 앱 런타임에는
> service_role이 필요 없습니다.

빌드 로그에서 확인할 것: `/transfers`·`/transfers/[id]`가 **`ƒ`(동적)** 이어야
합니다. `○`면 `unstable_rethrow` 가드가 `cookies()`의 내부 에러를 삼킨 것입니다
([`docs/conventions/nextjs.md`](docs/conventions/nextjs.md)).
**`/sitemap.xml`만 `○` + `30s`가 정상**입니다 — 쿠키를 읽지 않아 통째로 프리렌더되고
`ANON_REVALIDATE`가 ISR 주기가 됩니다.

### 3. Supabase 대시보드 (배포 도메인이 정해진 뒤)

| 위치 | 값 |
|---|---|
| Authentication → **URL Configuration** → Site URL | `https://<이름>.vercel.app` |
| 〃 → Redirect URLs | `https://<이름>.vercel.app/**` (프리뷰도 쓰려면 `https://<이름>-*.vercel.app/**`) |
| Authentication → **Providers** | Kakao · Google 활성화 + 키 4개 직접 입력 |
| 〃 → Email | **비활성** (이 앱은 소셜 전용입니다) |
| 〃 설정의 **Manual Linking** (`config.toml`의 `enable_manual_linking`에 대응) | 활성 — `/profile`의 "로그인 수단 연결"(`features/link-identity`)이 이 값에 의존합니다 |

각 프로바이더 콘솔에는 **앱 주소가 아니라 Supabase 콜백**(`https://<ref>.supabase.co/auth/v1/callback`)을
등록합니다 → [소셜 로그인 설정](docs/oauth-setup.md).

> ⚠ 앱 복귀 주소가 Redirect URLs에 없으면 GoTrue가 **조용히 Site URL로 되돌려** 보냅니다 —
> `?next=`가 통째로 사라져 "딜 상세에서 로그인했는데 보드로 떨어지는" 증상이 됩니다.

### 4. 이적 소식 수집 (GitHub Actions)

`.github/workflows/sync-transfer-news.yml`이 **매시** `node scripts/sync-transfer-news.mjs --remote`를 돌린다
(수집 → 딜 파생 → 한국어 요약). 저장소 시크릿에 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`·
`ANTHROPIC_API_KEY`를 넣는다. 주기의 상한과 무료 한도는 [`docs/conventions/api-and-db.md`](docs/conventions/api-and-db.md)의
이적 소식 동기화 절에 있다.

### 5. 배포 후 자동화되지 않는 것

| 항목 | 상태 |
|---|---|
| **구단 엠블럼** | `public/crests/`에 커밋된 것만 뜹니다. 없는 구단은 약칭 모노그램으로 떨어지고, 채우려면 `node scripts/fetch-team-crests.mjs` 후 커밋·재배포입니다 |
| **이적 창 일정·보도 주체 표기** | `scripts/lib/transfer/windows.json`·`reporters.json`을 시즌마다 사람이 갱신합니다 |
| **옛 스토리지 버킷** | `post-images`·`survey-images`는 대시보드에서 비우고 지웁니다(위 1번의 경고) |

> ⚠ **무료 플랜의 Supabase 프로젝트는 무활동이 이어지면 정지됩니다** — 정지되면 사이트 전체가
> 데이터를 잃은 것처럼 보입니다.

---

## 📁 프로젝트 구조

라우팅은 얇게(`app/`), 구현은 FSD 레이어(`src/`)로 분리합니다. 의존 방향은
`shared ← entities ← features ← widgets ← views` 단방향이며, 각 슬라이스의 `index.ts`가 public API입니다.
상세 규칙은 [`docs/conventions/`](docs/conventions/).

```
app/                     # Next.js 라우팅 전용 (view만 마운트)
├── page.tsx             #   / → /transfers 리다이렉트
├── (auth)/              #   sign-in (GuestOnly 셸). 소셜 로그인 복귀 지점이기도 하다
├── transfers/           #   이적 보드 · [id] (딜 + 보도 타임라인)
├── profile/             #   닉네임·사진 수정 + 계정 연결. 계정 연결의 복귀 지점
└── sitemap.ts / robots.ts  #   색인 신호 (Route Handler는 없다 — 이 둘은 Next 특수 파일이다)
proxy.ts                 # 세션 쿠키 리프레시 (Next 16의 middleware). 라우트 가드는 없다
src/
├── app/                 # providers(QueryClient + AuthProvider), fonts, globals.css
├── views/               # 화면 조립 (⚠ pages 금지)
├── widgets/             # app-bar · bottom-tab-bar · sub-header · tab-scroll-area · auth-shell · auth-status
├── features/            # 사용자 액션 1개 = 슬라이스 1개
├── entities/            # session · profile · transfer
├── shared/              # ui / api / lib / config
└── types/               # database.types.ts (supabase 생성 — 손으로 고치지 않는다)
supabase/
├── migrations/          # 스키마 = 보안 설계
├── seed.sql             # db reset이 자동 실행 (개발 계정 alice/bob)
└── tests/               # run-rls.sh · rls.sql
scripts/                 # 운영 스크립트 — 이적 소식 수집·파생·요약, 구단 엠블럼, 규약 검사
docs/
├── conventions/         # 코딩 컨벤션
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
pnpm test:transfer      # 이적 파이프라인 회귀(추출·조립·파생·요약·이름·소스 — DB 없이 돈다)
```

> ⚠ `build`와 `build:prod`는 **같은 `.next/`를 쓴다.** `build:prod` 뒤에 `pnpm start`를 부르면
> 원격을 바라보는 빌드가 그대로 뜬다. 로컬로 돌아올 때는 `pnpm build`를 다시 돌릴 것.

---

## ✅ 검증

자동 테스트 프레임워크는 없습니다. 대신 **DB 계층에 실행 가능한 검증 스크립트**를 둡니다 —
RLS가 유일한 방어선이라 정책을 고칠 때마다 돌려야 합니다.

```bash
# RLS · 컬럼 권한 · 함수 · 회귀 검사 (전체 rollback이라 DB에 흔적을 남기지 않는다)
bash supabase/tests/run-rls.sh

# 이적 파이프라인 회귀 (DB·네트워크 없이 돈다)
pnpm test:transfer
```
