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
> 예외는 어드민의 경기 일정 동기화 하나뿐인데, 그건 데이터 접근이 아니라 **외부 API를
> 서버 비밀로 부르는 자리**입니다(검사가 목록을 양방향으로 대조합니다).

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
# 구단 엠블럼(public/crests/)은 이미 커밋돼 있어 따로 받을 필요가 없다.
#   승격팀이 생겨 빈 자리가 보이면: node scripts/fetch-team-crests.mjs   (API_FOOTBALL_KEY 필요)
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

## 🚀 배포 (Vercel)

호스팅은 **Vercel**, 데이터는 **원격 Supabase 프로젝트**입니다. Auth 설정은 파일이 아니라
**Supabase 대시보드**가 소유합니다 — `supabase config push`는 절대 쓰지 마세요(위 경고).

### 1. 원격 Supabase 준비

```bash
supabase login                      # SUPABASE_ACCESS_TOKEN 발급
supabase link --project-ref <ref>   # .env.local의 SUPABASE_PROJECT_REF

supabase db reset                   # ① 로컬에서 먼저 마이그레이션 건전성 확인
bash supabase/tests/run-rls.sh      #    (러너는 로컬 스택 전용입니다 — 127.0.0.1:64322 고정)

supabase db push                    # ② 원격에 마이그레이션 적용 (Storage 버킷 3개도 여기서 생성)
supabase migration list --linked    # ③ Local/Remote 열이 일치하는지 대조
```

> 🔴 **`supabase db reset --linked`를 쓰면 원격에서 `seed.sql`이 돕니다** — 비밀번호가
> `test1234`인 테스트 계정이 생기고 그중 하나에 `is_admin = true`가 붙습니다.
> 시드는 로컬 전용이고, `db push`는 시드를 실행하지 않습니다.

### 2. Vercel 프로젝트

| 항목 | 값 |
|---|---|
| Framework | Next.js (자동 감지) |
| Build Command | **기본 `next build`** — ⚠ `build:prod`를 쓰면 안 됩니다(`.env.prod`는 저장소에 없습니다) |
| Install Command | 자동 (`pnpm-lock.yaml`) |

**환경변수는 아래 5개가 전부입니다.** `process.env`를 읽는 곳은
`src/shared/config/env.ts` · `app/api/admin/sync-matches/route.ts` · `scripts/lib/sync-db.mjs` 셋뿐입니다.

| 키 | 범위 | 없으면 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production + Preview | 모든 조회가 "서비스 설정이 완료되지 않았어요."(빌드는 성공합니다) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production + Preview | 〃 |
| `NEXT_PUBLIC_SITE_URL` | **Production만** | Preview는 비워 둬야 `VERCEL_URL` 폴백이 배포별 도메인을 잡습니다 |
| `SUPABASE_SERVICE_ROLE_KEY` | Production (Sensitive) | 어드민 '경기 일정 가져오기'가 500 |
| `API_FOOTBALL_KEY` | Production (Sensitive) | 〃 |

> ⚠ **`NEXT_PUBLIC_*`는 빌드 시점에 인라인됩니다** — 값을 바꾸면 **반드시 재배포**해야 합니다.
> `NEXT_PUBLIC_SITE_URL`이 도메인 확정 전에 정해져야 하므로, Import 화면에서 프로젝트 이름을
> 먼저 정하고 그 자리에서 `https://<이름>.vercel.app`을 넣은 뒤 첫 배포를 돌립니다.

> ⚠ **`NEXT_PUBLIC_SHOW_PLAYER_PHOTOS`는 넣지 않습니다.** 기본 꺼짐이 의도된 안전 기본값이고
> (선수 초상·퍼블리시티권 미확인), 꺼지면 `PlayerPhoto`가 실루엣으로 떨어집니다.

> ⚠ **`SUPABASE_AUTH_EXTERNAL_*` 4개와 `SUPABASE_PROJECT_REF`·`SUPABASE_DB_PASSWORD`·
> `SUPABASE_ACCESS_TOKEN`은 Vercel에 넣지 않습니다** — 앞의 넷은 대시보드가, 뒤의 셋은
> 로컬 CLI가 소유합니다.

빌드 로그에서 확인할 것: `/posts`·`/posts/[id]`·`/surveys`·`/matches`가 **`ƒ`(동적)** 이어야
합니다. `○`면 `unstable_rethrow` 가드가 `cookies()`의 내부 에러를 삼킨 것입니다
([`docs/conventions/nextjs.md`](docs/conventions/nextjs.md)).
**`/notices`만 `○` + `30s`가 정상**입니다 — 쿠키를 읽지 않아 통째로 프리렌더되고
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
> `?next=`가 통째로 사라져 "글쓰기를 누르고 로그인했는데 목록으로 떨어지는" 증상이 됩니다.

### 4. 첫 관리자 지정

앱에 자가 승격 경로가 없습니다(`profiles`의 UPDATE grant는 `(nickname, avatar_path)`뿐이고
`is_admin`은 SELECT조차 막혀 있습니다). 배포 사이트에서 소셜 로그인을 한 번 한 뒤
SQL Editor에서:

```sql
select id, nickname, created_at from public.profiles order by created_at desc limit 5;
update public.profiles set is_admin = true where id = '<내 uuid>';
```

그다음 `/admin-you-can-not-access` → **경기 일정 가져오기**로 `team`·`match`를 채웁니다.
비관리자에게 이 경로가 404인 것이 정상입니다.

### 5. 배포 후 자동화되지 않는 것

| 항목 | 상태 |
|---|---|
| **경기 상세 폴러**(`sync-match-detail.mjs`, 5분 주기 전제) | 실행 주체가 없습니다 — 라인업·기록 탭이 빕니다. `node scripts/sync-match-detail.mjs --remote`를 수동으로 돌립니다 |
| **일정 동기화** | 어드민 화면 버튼으로만 돕니다. `/api/admin/sync-matches`는 쿠키 세션 + `is_admin` RPC로 인가해 크론이 부를 수 없습니다 |
| **입축구 면 배경 이미지** | 마이그레이션이 파일을 옮기지 않습니다 → 어드민 화면에서 업로드합니다(`upload-survey-images.mjs`는 로컬 스택 전용입니다) |
| **구단 엠블럼** | `public/crests/`에 커밋된 것만 뜹니다. 없는 팀은 약칭 모노그램으로 떨어지고, 채우려면 `node scripts/fetch-team-crests.mjs` 후 커밋·재배포입니다 |

> ⚠ **무료 플랜의 Supabase 프로젝트는 무활동이 이어지면 정지됩니다** — 정지되면 사이트 전체가
> 데이터를 잃은 것처럼 보입니다.

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
├── admin-you-can-not-access/  # 어드민 백오피스 (layout이 is_admin()으로 판정 → 아니면 404)
├── api/admin/sync-matches/    # ⚠ 유일한 Route Handler — 외부 API를 서버 비밀로 부르는 자리
└── sitemap.ts / robots.ts  #   색인 신호 (Next 특수 파일이라 "route.ts 금지"에 걸리지 않는다)
proxy.ts                 # 세션 쿠키 리프레시 (Next 16의 middleware). 라우트 가드는 없다
src/
├── app/                 # providers(QueryClient + AuthProvider), fonts, globals.css
├── views/               # 화면 조립 (⚠ pages 금지)
├── widgets/             # app-bar · bottom-tab-bar · sub-header · tab-scroll-area · auth-shell · auth-status · admin-shell
├── features/            # 사용자 액션 1개 = 슬라이스 1개
├── entities/            # session · post · comment · profile · poll · survey · match · block · notice
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
