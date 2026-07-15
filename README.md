# ⚽ 온더볼 (On the Ball)

> 해외축구의 가십·밸런스 대결·퀴즈를 다루는 **모바일 전용** 커뮤니티 투표 앱

![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-149eca?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ecf8e?logo=supabase)
![TanStack Query](https://img.shields.io/badge/TanStack_Query-5-ff4154?logo=reactquery)

`design_handoff_ontheball/`의 하이파이 디자인 핸드오프(Tifo 디자인 시스템)를 기반으로 구현했으며,
모든 투표·퀴즈·스트릭·뱃지가 **Supabase 실데이터**로 동작합니다.

> 디자인 핸드오프(`design_handoff_ontheball/`)는 **Claude 디자인 + getdesign의 Supabase 포맷**을 참고해 제작되었습니다.

---

## ✨ 주요 기능

핵심 콘텐츠 4종이 하나의 투표 파이프라인 위에서 동작합니다.

- **밸런스 게임**: "메시 vs 호날두" 같은 양자택일. 투표 후 실시간 비율·연령대 분석·댓글 공개
- **랭킹 투표**: 발롱도르 등 다지선다 1인 투표. 득표순 정렬 + 지역별 1위
- **퀴즈**: 라인업 국적만 보고 팀·시즌 맞히기. 매일 1문제 + 연속 정답 스트릭
- **TMI 진실/거짓**: 선수 가십 카드를 진실/거짓으로 판정하고 다수 의견과 비교
- **결과 게이팅**: 결과 그래프와 댓글은 **투표한 사람에게만** 공개
- **익명 로그인**: 첫 방문 시 자동으로 익명 세션이 발급되어 별도 가입 없이 투표 이력·스트릭이 쌓임

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

- **Node.js** 20 이상
- **pnpm** 10 이상
- **Supabase CLI** 2.6 이상 + **Docker** (로컬 DB 스택 구동용)

### 설치 및 실행

```bash
# 저장소 클론
git clone <repository-url>
cd on-the-ball

# 의존성 설치
pnpm install

# 로컬 Supabase 스택 기동 (Docker 필요)
supabase start

# 마이그레이션 + 시드 적용
supabase db reset

# 개발 서버 실행
pnpm dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 을 열어 확인하세요.
`.env.local`에는 로컬 스택 값이 미리 채워져 있어 바로 실행됩니다. 첫 방문 시 자동으로 익명 세션이 발급되고, 투표하면 실제 DB에 기록됩니다.

> **참고:** 이 프로젝트의 로컬 Supabase 스택은 포트 충돌을 피하기 위해 표준(543xx)이 아닌 **643xx** 포트를 사용합니다 (`supabase/config.toml`).

---

## ⚙️ 환경 변수

`.env.example`을 복사하여 `.env.local`을 생성하고 값을 입력하세요:

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

라우팅은 얇게(`app/`), 구현은 FSD 레이어(`src/`)로 분리합니다. 의존 방향은 `shared ← entities ← features ← widgets ← views` 단방향이며, 각 슬라이스의 `index.ts`가 public API입니다.

```
app/                    # Next.js 라우팅 전용 (얇은 레이어)
├── (tabs)/             # 탭 5개: 홈·밸런스·퀴즈·TMI·내 활동 (플로팅 탭바 셸)
├── (detail)/           # 풀스크린 디테일: balance/quiz/ranking/kit (탭바 없음)
└── api/                # Route Handlers (polls·quizzes·comments·me·home)
proxy.ts                # Supabase 세션 쿠키 리프레시 (Next 16의 middleware)
src/
├── app/                # FSD app 레이어: providers, fonts, globals.css
├── views/              # 화면 조립 (home / balance-* / quiz-* / ranking-detail / kit-vote / tmi / activity)
├── widgets/            # app-bar / bottom-nav / sub-header / tab-scroll-area
├── features/           # cast-vote / submit-quiz-attempt / write-comment / like-comment
├── entities/           # poll(4종 투표 공통) / quiz / user
└── shared/             # ui / api / lib / config
supabase/
└── migrations/         # 0001_init(스키마·RLS·RPC·뷰) + 0002_seed(콘텐츠 시드)
```

---

## 📦 스크립트

```bash
pnpm dev          # 개발 서버 실행 (http://localhost:3000)
pnpm build        # 프로덕션 빌드
pnpm start        # 프로덕션 서버 실행
pnpm lint         # ESLint 실행
pnpm lint:fix     # ESLint 자동 수정
```

---

## 🗄 데이터베이스 설계

밸런스·랭킹·유니폼·TMI 4종 투표를 `polls / poll_options / votes` **단일 파이프라인**으로 처리하고(타입별 표현 차이는 `meta` jsonb로 흡수), 정답이 존재하는 퀴즈만 별도 테이블로 분리합니다.

| 테이블 | 역할 |
|---|---|
| `profiles` | 익명 가입 시 트리거로 자동 생성. 스트릭, 팬 태그, (향후) 연령대·지역 |
| `polls` / `poll_options` / `votes` | 투표 4종 공통. `seed_votes`로 초기 표 + 실투표 누적 |
| `comments` / `comment_likes` | "한 줄 거들기" — **투표한 사용자만 작성** (RLS로 DB단 강제) |
| `quizzes` / `lineups` / `quiz_choices` / `quiz_attempts` | 라인업 퀴즈. 정답·해설은 컬럼 권한으로 숨김 |
| `badges` / `user_badges` | 첫 한 표·연속 10일 등 (RPC가 자동 지급) |
| `poll_demographics` | 연령대·지역 분석 시드 통계 (추후 실집계로 교체) |
| `trending_items` | 홈 "지금 뜨거운 떡밥" |

**무결성 장치**

- 쓰기는 `cast_vote` / `submit_quiz_attempt` **RPC(SECURITY DEFINER)** 로만 — 중복 방지(동시 요청 직렬화), 마감 검증, "24시간 안에 1회 변경" 정책, 스트릭 증감(**하루 1회만 반영**), 뱃지 지급을 원자 처리. 런타임에 service role 불필요
- 퀴즈 정답·해설·보기별 픽 수는 컬럼 권한·뷰 게이트로 차단, **시도한 사용자에게만** 공개 (공개 정답률과 픽 분포를 조합한 정답 역산까지 차단)
- `profiles`는 공개 컬럼(닉네임·팬 태그)과 사용자 편집 컬럼만 열려 있고, 스트릭·성향은 RPC 전용 — 본인 전체 행은 `my_profile` 뷰로 조회
- 모든 API 응답에 `Cache-Control: private, no-store` (개인화 응답의 공유 캐시 유출 방지)

---

## 🔌 API 엔드포인트

모든 핸들러는 `@supabase/ssr` 서버 클라이언트(요청 쿠키 기반, RLS 적용) + Zod 입력 검증을 사용합니다.

| 메서드·경로 | 동작 |
|---|---|
| `GET /api/home` | 홈 피드 집계 (히어로·캐러셀·오늘의 퀴즈·진행 중 투표·트렌딩) |
| `GET /api/polls?type=` · `GET /api/polls/[id]` | 투표 리스트/디테일 (+내 투표, 인구통계, 댓글 수) |
| `POST /api/polls/[id]/votes` | 투표 (kit은 재탭 취소, 24h 1회 변경) |
| `GET·POST /api/polls/[id]/comments` · `POST /api/comments/[id]/likes` | 댓글·동감 |
| `GET /api/quizzes` · `GET /api/quizzes/[id]` · `POST /api/quizzes/[id]/attempts` | 퀴즈 목록/디테일/시도 |
| `GET /api/me/profile` · `GET /api/me/activity` | 내 프로필(스트릭) / 활동 집계 |

---

## 🌐 배포 — 원격 Supabase 연결

로컬은 위 "시작하기"만으로 동작합니다. 원격(실서비스) Supabase에 연결하려면:

1. **`.env.local` 값 교체** — 대시보드 → Project Settings → API 에서 URL·anon 키를, `SUPABASE_PROJECT_REF`·`SUPABASE_DB_PASSWORD`·`SUPABASE_ACCESS_TOKEN`을 채웁니다.
2. **익명 로그인 활성화** — 대시보드 → Authentication → Sign In / Up → **Allow anonymous sign-ins** ON
3. **마이그레이션 + 시드 적용**
   ```bash
   supabase link --project-ref $SUPABASE_PROJECT_REF
   supabase db push
   ```
   (또는 Supabase MCP로 `supabase/migrations/`의 SQL 2개를 순서대로 적용)
4. `pnpm build && pnpm start` 로 배포합니다.

---

## 🧭 앞으로의 확장 포인트

- **연령대·지역 입력 UI** → `profiles.age_group/region` 컬럼은 준비됨. 입력이 쌓이면 `poll_demographics` 시드를 `votes ⨝ profiles` 실집계 뷰로 교체
- **트렌딩 실계산** → 이력 스냅샷 테이블 추가 후 델타 계산 (현재는 시드)
- **"나의 축구 성향" 리포트** → 월 배치로 `profiles.trait_*` 갱신 (현재는 기본 문구)
- **TMI 스와이프 제스처** → 현재는 버튼 판정 (핸드오프 권장사항)
- **매일 새 퀴즈** → `quizzes.opens_on`에 날짜만 넣으면 자동 오픈
