# 온더볼 v1 인벤토리 (청산 전 스냅샷)

> 작성일: 2026-08-01
> 목적: 기능·DB를 전부 걷어내고 재설계하기 전에, **v1이 무엇을 어떻게 만들었는지**를 남긴다.
> 이 문서만 읽으면 v1의 화면·데이터 모델·정책·API 계약을 복원할 수 있어야 한다.
> 코드 실물은 커밋 `5d02657` (main) 시점을 기준으로 한다 — 삭제 후에도 git 이력으로 복구 가능.

---

## 0. v1을 한 문장으로

> 해외축구 가십·밸런스 대결·퀴즈를 다루는 **모바일 전용 익명 커뮤니티 투표 앱**.
> 밸런스·랭킹·유니폼·TMI **4종 투표를 `polls/poll_options/votes` 단일 파이프라인**에 태우고,
> 정답이 존재하는 **퀴즈만 별도 테이블**로 분리했다.

### v1이 채택한 큰 설계 판단 (재설계 시 계승/폐기를 결정할 지점)

| # | 판단 | 배경 | 재검토 포인트 |
|---|---|---|---|
| 1 | 4종 투표를 한 테이블로 통합, 타입 차이는 `meta` jsonb로 흡수 | 투표 파이프라인(중복방지·집계·게이팅)을 한 번만 구현 | jsonb가 타입별 표현값의 쓰레기통이 됨 → 안전 파서 5종이 필요해졌다 |
| 2 | 익명 로그인만 (가입 없음) | 진입 마찰 0 | 기기 바꾸면 이력 소실. 계정 승격 경로 없음 |
| 3 | 쓰기는 전부 SECURITY DEFINER RPC | 원자성·정책을 DB에서 강제, 런타임 service role 불필요 | 정책 변경 = 마이그레이션. 로직이 SQL에 갇힘 |
| 4 | 결과 게이팅 (투표해야 결과·댓글 공개) | 참여 유도 | v1은 API가 수치를 항상 내려주고 **UI에서만** 가림 (리스트 카드가 비율 바를 그려야 해서) — 실제로는 게이팅이 아님 |
| 5 | 시드 득표(`seed_votes`)로 초기 화면 연출 | 콜드스타트에 빈 그래프를 안 보이게 | 실데이터와 시드가 영구히 섞임. 분리 컬럼이 없으면 되돌릴 수 없다 |
| 6 | 공개 URL은 정수 id가 아닌 `slug` | 열거 방지·가독성 | 라우트마다 slug→id 해석 왕복이 1회씩 추가됨 |

---

## 1. 화면 인벤토리

라우트 구조는 탭 셸(`(tabs)`, 하단 플로팅 탭바)과 풀스크린 디테일(`(detail)`, 탭바 없음)로 나뉜다.

### 1.1 탭 5개

| 라우트 | 뷰 슬라이스 | 화면 내용 |
|---|---|---|
| `/` | `views/home` | **홈 피드** — ① 히어로(featured 밸런스, 대각선 스플릿 카드+VS 배지) ② 가벼운 양자택일 캐러셀(240px 미니 카드 가로 스크롤) ③ 오늘의 퀴즈 다크 배너(국기 4줄 프리뷰 + 정답률·도전자) ④ 진행 중인 투표(ranking·kit 리스트 행, 80px 커버 썸네일) ⑤ "지금 뜨거운 떡밥" 트렌딩 5행(순번·투표수·상승/하락 pill) ⑥ TMI 프로모 카드 |
| `/balance` | `views/balance-list` | **밸런스 리스트** — 자체 헤더 + 태그 필터 + 카드(70px 2분할 스트립·VS 배지·마감 pill·4px 비율 바·양측 투표수) |
| `/quiz` | `views/quiz-list` | **퀴즈 리스트** — 다크 Streak 카드(56px 에메랄드 원에 연속 정답 일수) + 오늘의 문제 카드(NEW pill) + 예정된 문제(dashed 보더·잠금, 클릭 불가) + 지난 문제 보관함(내 정답/오답 아이콘) |
| `/tmi` | `views/tmi` | **TMI 진실/거짓 덱** — 카드 한 장씩 진실/거짓 판정 → 결과 오버레이(hold) → 카드 이탈(translateX ±120% rotate ±14deg) → 다음 카드. 덱 완료 시 "다수 의견과 몇 개 일치" 요약 |
| `/me` | `views/activity` | **내 활동** — 프로필(닉네임·팬 태그·가입월) + 스탯(총 투표 수·퀴즈 정답률·현재 스트릭) + 최근 한 표 리스트(폴은 동의율, 퀴즈는 정오답) + "나의 축구 성향" 다크 카드 |

### 1.2 풀스크린 디테일 4개

| 라우트 | 뷰 슬라이스 | 화면 내용 |
|---|---|---|
| `/balance/[slug]` | `views/balance-detail` | **밸런스 디테일** — 투표 전(메타 pill 줄·헤드라인·대각선 스플릿) ↔ 탭 후 **380ms 선택 강조 → 리빌** ↔ 결과(56px 비율 바 width 0→실값 0.8s, WIN pill, 내 표 마커, 스탯 비교 행, 면별 blurb 카드, 연령대·지역 응답자 분석, "한 줄 거들기" 댓글). 이미 투표했거나 마감된 폴은 즉시 리빌 |
| `/ranking/[slug]` | `views/ranking-detail` | **랭킹 투표** — 투표 전 후보 행(순번·파스텔 아바타+국기 뱃지·radio) → 투표 후 득표순 정렬 + 비율 바 + 퍼센트·득표수 + 내 표 칩 |
| `/kit/[slug]` | `views/kit-vote` | **유니폼 투표** — 2열 그리드, 1:1 소프트 배경 + `Shirt` 컴포넌트(스트라이프 종류) + 클럽명, 투표 후 비율 바 |
| `/quiz/[slug]` | `views/quiz-detail` | **퀴즈 디테일** — 피치 뷰(그린 그라데이션·잔디 스트라이프·라인 프레임 위 포메이션 4줄을 국기+포지션 칩으로) + 힌트 토글 + 보기 선택 → 제출 → 정오답·해설·보기별 픽 분포 공개 |

### 1.3 에러 안전망 (파일 컨벤션)

`app/error.tsx`(탭 셸까지 대체되므로 재시도 + "홈으로" 탈출 경로), `app/global-error.tsx`(루트 layout 파손 대비, 공용 UI 미사용), `app/not-found.tsx`.
재시도 prop은 Next 16 기준 **`unstable_retry`**.

---

## 2. DB 스키마 (Supabase / PostgreSQL)

마이그레이션 3개: `20260704000001_init.sql`(576줄) · `20260704000002_seed.sql`(224줄) · `20260729000003_vote_final.sql`(74줄).

### 2.1 테이블 13개

**설계 관례**: 모든 PK/FK는 `bigint` 대리키. 사람이 읽는 식별자는 `slug` 컬럼으로 분리하고 공개 URL에만 slug 사용.
시드 id 관례: `poll_options.id = poll_id*100 + n`, `quiz_choices.id = quiz_id*10 + n`.

#### `profiles` — 익명 가입 시 트리거로 자동 생성
```
id uuid PK → auth.users(id) on delete cascade
nickname text not null           -- '익명의 축덕 ' || (1000 + random*9000)
fan_team text                     -- 팬 태그
age_group text / region text      -- 입력 UI 미구현 (null 허용만)
current_streak int / best_streak int / last_quiz_date date
trait_title text / trait_text text -- "나의 축구 성향" (v1은 기본 문구)
created_at timestamptz
```
트리거 `on_auth_user_created` (after insert on `auth.users`) → `handle_new_user()` (SECURITY DEFINER).

#### `polls` — 투표 4종 공통 컨테이너
```
id bigint PK / slug text unique   -- 'goat', 'ballon-2026', 'kit-2526'
type text check in ('balance','ranking','kit','tmi')
title / subtitle / tag text
closes_at timestamptz             -- null이면 무기한
featured boolean                  -- 홈 히어로 노출
position int                      -- 리스트·덱 정렬
meta jsonb                        -- 타입별 표현값 (홈 카피·TMI 카드 본문 등)
```

#### `poll_options`
```
id bigint PK / poll_id FK / position int
label text (메시 / 음바페 / 맨유 / 진실 …) / sublabel text
seed_votes int                    -- 연출용 초기 득표 (실투표는 votes에 누적)
meta jsonb                        -- side/tone/text/accent/stats/blurb/flag/hue/stripe/verdict
unique (poll_id, position)
```

#### `votes`
```
id bigint PK / poll_id FK / option_id FK / user_id FK→profiles
created_at / updated_at
unique (poll_id, user_id)         -- 1인 1표
```
> `changed_count` 컬럼은 0003에서 **드롭**됨 (24h 변경 정책 폐기).

#### 나머지
| 테이블 | 핵심 컬럼 | 역할 |
|---|---|---|
| `poll_likes` | PK(poll_id, user_id) | 투표 좋아요 |
| `comments` | poll_id, user_id(nullable), `display_name`·`display_tag`(시드 댓글용 비정규화), body(1~500자 check), `seed_likes` | "한 줄 거들기" |
| `comment_likes` | PK(comment_id, user_id) | 동감 |
| `lineups` | slug, formation('4-3-3'), caption, `rows jsonb` — `[[{"pos":"GK","flag":"BE"}], [4명], [3명], [3명]]` GK줄부터 | 퀴즈 피치 뷰 |
| `quizzes` | slug, kind('lineup'), title, subtitle, hint, **answer_text**, lineup_id, `opens_on date` | 매일 1문제 |
| `quiz_choices` | quiz_id, position, team, season, **is_correct**, **seed_picks** | 보기 |
| `quiz_attempts` | quiz_id, choice_id, user_id, is_correct, unique(quiz_id, user_id) | 1인 1시도 |
| `poll_demographics` | poll_id, dimension check in('age','region'), bucket('20대'/'유럽'), option_id, ratio(0~1) | **시드 통계** (실집계 아님) |
| `trending_items` | position, title, vote_count, delta check in('up','down','new'), poll_id | 홈 "지금 뜨거운 떡밥" **시드 전용** |

### 2.2 집계 뷰 6개 (전부 `security_invoker = off` = SECURITY DEFINER)

| 뷰 | 정의 | 공개 범위 |
|---|---|---|
| `poll_results` | `seed_votes + count(votes)` per option | 전체 공개 |
| `poll_like_stats` | poll별 좋아요 수 | 전체 공개 |
| `quiz_choice_stats` | `seed_picks + count(attempts)` per choice — **`where exists(내 quiz_attempts)` 게이트** | 시도자만 |
| `quiz_stats` | quiz별 `attempts`·`accuracy_pct` (게이트된 뷰를 경유하지 않고 원본에서 직접 집계) | 전체 공개 |
| `quiz_reveal` | choice_id·is_correct·answer_text — **시도자 게이트** | 시도자만 |
| `my_profile` | `select * from profiles where id = auth.uid()` | 본인 |

> ⚠ **정답 역산 차단**: 공개 `quiz_stats.accuracy_pct`와 보기별 픽 분포를 조합하면 "점유율 == 정답률인 보기"가 정답으로 역산된다. 그래서 `quiz_choice_stats`에 시도자 게이트가 필수였다.

### 2.3 RPC 2개 (쓰기의 유일한 진입점, SECURITY DEFINER, `search_path = ''`)

#### `cast_vote(p_poll_id, p_option_id) → jsonb`
**최종 정책(0003) = "한 번 던진 표는 바꿀 수 없다"**

> ⚠ 이 최종 정책은 **로컬에만 적용돼 있었다.** 원격에는 0001·0002만 push되어, 원격 `cast_vote`는 끝까지 아래 "폐기된 0001 정책"(24h 내 1회 변경 + kit 재탭 취소) 버전으로 남아 있었다.

```
표 없음      → insert 후 { status: 'voted' }
같은 선택지  → { status: 'unchanged' }  (더블탭·네트워크 재시도 멱등)
다른 선택지  → raise VOTE_LOCKED
```
예외: `AUTH_REQUIRED` / `POLL_NOT_FOUND` / `POLL_CLOSED`(closes_at 경과) / `INVALID_OPTION` / `VOTE_LOCKED`.
동시성: 기존 표를 `for update`로 잠그고 검사 + `unique_violation` catch로 첫 표 경합까지 멱등 처리.

> **폐기된 0001 정책**(재설계 시 참고): 첫 투표 후 24시간 내 1회 변경 허용(`CHANGE_LIMIT`/`CHANGE_WINDOW_OVER`), 유니폼(kit)만 같은 선택지 재탭 시 투표 취소(`status: 'cancelled'`).

#### `submit_quiz_attempt(p_quiz_id, p_choice_id) → jsonb`
```
반환: { is_correct, correct_choice_id, answer_text, streak }
```
검증: `AUTH_REQUIRED` / `QUIZ_NOT_FOUND` / `QUIZ_LOCKED`(opens_on > current_date) / `INVALID_CHOICE` / `ALREADY_ATTEMPTED`(exists 검사 + unique_violation 양쪽).

**스트릭 규칙 (하루 1회만 반영)** — 지난 문제 몰아풀기로 +N 되는 것을 막는다:
```
last_quiz_date == 오늘        → current_streak 유지
last_quiz_date < 어제         → base = 0 에서 시작 (하루라도 건너뛰면 리셋)
정답 → base + 1 / 오답 → 0
best_streak = greatest(best_streak, new)
last_quiz_date = current_date
```

### 2.4 RLS·권한

- **전체 활성화** (13개 테이블 모두 `enable row level security`).
- **공개 읽기**: profiles·polls·poll_options·poll_likes·comments·comment_likes·lineups·quizzes·quiz_choices·poll_demographics·trending_items.
- **본인만 읽기**: `votes`, `quiz_attempts`.
- **쓰기 정책 없음** → `votes`·`quiz_attempts`는 RPC로만 기록 가능.
- **댓글 게이팅을 DB에서 강제**: `comments_insert_voter_only` — `exists(votes where poll_id = comments.poll_id and user_id = auth.uid())`. 위반 시 API가 403 "투표한 뒤에 댓글을 남길 수 있어요."로 매핑.
- **토글류**: poll_likes·comment_likes insert/delete는 본인 행만.

**컬럼 권한 (⚠ 해당 테이블은 `select *` 불가 — 컬럼 명시 필수)**
```sql
-- quizzes: answer_text 숨김
grant select (id, slug, kind, title, subtitle, hint, lineup_id, opens_on, created_at)
-- quiz_choices: is_correct·seed_picks 숨김 (seed_picks도 역산 방지용)
grant select (id, quiz_id, position, team, season)
-- profiles 읽기: 공개 컬럼만
grant select (id, nickname, fan_team, created_at)
-- profiles 쓰기: 사용자 편집 컬럼만 (스트릭·trait_*는 RPC 전용)
grant update (nickname, fan_team, age_group, region) to authenticated
revoke insert, delete on profiles
-- comments 쓰기: 시드 필드·작성시각 위조 차단
grant insert (poll_id, user_id, body) to authenticated
```

### 2.5 시드 데이터 규모 (`0002_seed.sql`)

프로토타입(`design_handoff_ontheball/prototype/app/*.jsx`)의 목데이터를 그대로 이식. 1회 적용 전제(`on conflict` 없음).

- polls: **밸런스 4 / 랭킹 1 / 유니폼 1 / TMI 5**
- poll_options: 밸런스 A·B, 랭킹 후보 6명(합 24,891표), 유니폼 6벌(합 8,214표), TMI 진실/거짓(`round(n × truePct/100)`으로 합 일치 보정)
- comments: 시드 댓글(user_id null + `display_*`), `created_at`은 "N분 전" 표기를 now() 기준 환산
- quizzes: 오늘 1 + 예정 2(잠금) + 지난 4, `quiz_choices.seed_picks`로 프로토타입 정답률·도전자 수 재현
- poll_demographics: 연령대 분포 + 지역별 1위 4건
- trending_items: 5건

---

## 3. API 계약 (Route Handler 11개)

모든 핸들러: `@supabase/ssr` 서버 클라이언트(요청 쿠키 → RLS 적용) + zod 입력 검증 + `withSupabase`/`ok`/`fail`.
응답 규격 — 성공 `{ data }`, 실패 `{ error: "한국어 메시지" }`. 전 응답에 `Cache-Control: private, no-store`.

| 메서드·경로 | 요약 |
|---|---|
| `GET /api/home` | 홈 피드 조립 (`buildHomeFeed`) — hero/quickPicks/todayQuiz/ongoing/trending |
| `GET /api/polls?type=` | 리스트 (position asc). 타입 미지원 시 400 |
| `GET /api/polls/[slug]` | 디테일 = 리스트아이템 + `demographics` + `commentCount` (병렬 조회) |
| `POST /api/polls/[slug]/votes` | body `{ optionId }` → `cast_vote` RPC. RPC 예외 → HTTP 매핑 |
| `POST /api/polls/[slug]/likes` | 좋아요 토글 → `{ liked }` |
| `GET/POST /api/polls/[slug]/comments` | 목록(최신순, `likes = seed_likes + count`, `likedByMe`·`isMine`) / 작성(1~500자, RLS 위반 시 403) |
| `POST /api/comments/[id]/likes` | 동감 토글 → `{ liked }` |
| `GET /api/quizzes` | `opens_on` 기준 today / upcoming(잠금) / past(보관함) 분류 |
| `GET /api/quizzes/[slug]` | 라인업 + 보기 + 집계 + 내 시도. **미래 문제는 423** ("매일 오전 8시에 새 문제가 열려요"). 정답은 `quiz_reveal`에서만 채움 |
| `POST /api/quizzes/[slug]/attempts` | body `{ choiceId }` → `submit_quiz_attempt` RPC |
| `GET /api/me/profile`, `GET /api/me/activity` | 내 프로필(스트릭) / 활동 집계 (세션 없으면 `null`) |

**공통 패턴**: `[id]`는 slug → 정수 id 해석 후 조회. 독립 조회는 `Promise.all` 병렬. 매핑은 `entities/*/api/mappers.ts`에 집중.

---

## 4. 프론트 구조 (FSD)

```
app/                  Next 라우팅 전용 (얇음)
├─ (tabs)/            홈·밸런스·퀴즈·TMI·내활동 — 공유 셸(스크롤 영역 + 플로팅 탭바)
├─ (detail)/          balance/quiz/ranking/kit — 탭바 없음
└─ api/               Route Handler 11개
proxy.ts              Supabase 세션 쿠키 리프레시 (Next 16에서 middleware → proxy 개명, matcher에서 /api 제외)
src/
├─ app/               providers(QueryClient·익명 세션) / fonts / globals.css
├─ views/             home · balance-list · balance-detail · ranking-detail · kit-vote · quiz-list · quiz-detail · tmi · activity
├─ widgets/           app-bar · bottom-nav · sub-header · tab-scroll-area
├─ features/          cast-vote · submit-quiz-attempt · write-comment · like-comment · like-poll
├─ entities/          poll · quiz · user
└─ shared/            ui(18종) · api · lib · config
```

### 재사용 자산 (재설계에서도 살아남을 가능성이 높은 것)

- **`shared/ui` 18종**: Button·Pill·Icon·Flag·Shirt·Avatar·RatioBar·Skeleton·EmptyState·SectionHead·TabHeader·LiveDot·LiveStatusPill·NightCard·Wordmark·PlayerSilhouette (+ `button-class.ts` 순수 함수 분리)
- **`shared/lib/format`**: `formatCount`·`formatPct`·`formatDday`·`isClosed`·`todayUtc`·`formatYearMonth`·`formatRelativeTime`
- **`shared/lib`**: `cn` · `useDelayedReveal`(선택→지연→리빌 시퀀스) · `useScrollRestore`(탭 스크롤 복원)
- **`shared/config`**: `ROUTES` 경로 헬퍼 · `COLOR` JS 색 상수
- **디자인 시스템 전체**: `src/app/styles/globals.css`의 Tailwind v4 `@theme` 토큰, Pretendard 서브셋 92개 + JetBrains Mono
- **`design_handoff_ontheball/`**: 하이파이 프로토타입(화면 6종 jsx + 디자인 토큰 CSS) — v1의 원본 소스

### v1 프론트에서 특기할 만한 처리

- **서버 프리페치**: `app/(tabs)/page.tsx` → `buildHomeFeed` → `<HomeView initialFeed>` → `useHomeQuery(initialFeed)`. 실패 시 `undefined` 폴백. `cookies()`가 던지는 프레임워크 내부 에러를 삼키지 않도록 catch에서 **`unstable_rethrow`** 필수.
- **하이드레이션 이슈(미해결)**: `formatDday`·`isClosed`가 내부에서 `Date.now()`를 호출 → 홈 서버 프리페치 도입 후 서버·클라 각 1회 평가. 사용자 기기 시계 오차가 크면 React `#418` 1건 발생(서브트리 재렌더로 값은 교정됨). **재설계 시 응답에 서버 시각을 실어 초기 렌더에 쓰는 방식으로 해결할 것.**
- **뮤테이션 규약**: 쓰기 전 `ensureAnonymousSession()` 선행, `onSuccess`에서 무효화 **Promise 반환**(리페치 완료까지 `isPending` 유지 → 재클릭 레이스 방지).
- **meta jsonb 안전 파서 5종**: `readSideMeta`·`readKitMeta`·`readRankingMeta`·`readTmiOptionMeta`·`readTmiPollMeta` — raw 캐스팅 금지, 계약 밖 값은 기본값 방어.

---

## 5. v1이 남긴 미완·부채 (재설계 입력값)

| 항목 | 상태 |
|---|---|
| 연령대·지역 입력 UI | **없음**. `profiles.age_group/region` 컬럼만 존재, `poll_demographics`는 전부 시드 |
| 트렌딩 실계산 | **없음**. `trending_items` 전부 시드 (이력 스냅샷 테이블 부재) |
| "나의 축구 성향" | **없음**. `trait_*` 기본 문구 고정 |
| 뱃지 시스템 | README에 `badges`/`user_badges` 언급이 있으나 **마이그레이션에 테이블이 없다** (미구현) |
| TMI 스와이프 제스처 | 버튼 판정만 (핸드오프 권장은 스와이프) |
| 매일 새 퀴즈 | 수동 — `quizzes.opens_on`에 날짜를 넣어야 열림. 자동 생성 파이프라인 없음 |
| 결과 게이팅 | API는 수치를 항상 반환, **UI에서만** 가림 (리스트 카드가 비율 바를 그려야 해서) |
| 계정 승격 | 없음 — 익명 세션 소실 = 이력 소실 |
| 검색·신고·차단·알림 | 전부 없음 |

---

## 6. 환경·인프라 메모

- 로컬 Supabase 스택은 포트 충돌 회피로 **643xx** 포트 사용 (`supabase/config.toml`).
- `.env.local`에 로컬 스택 값이 채워져 있음. env가 비어도 빌드는 성공하고 API가 503 안내를 반환.
- **원격 청산 완료 (2026-08-01)** — 프로젝트 `umcsedjsuwthuxaqwtpz`의 public 테이블·뷰·함수, `auth.users`의 `on_auth_user_created` 트리거, `supabase_migrations.schema_migrations` 이력을 모두 제거했다. 청산 시점 원격의 실사용 데이터는 0건이었다(auth.users·profiles·votes·quiz_attempts 모두 0 — 남아 있던 건 시드뿐).
- 청산 중 확인된 사실: **원격에는 0001·0002만 적용돼 있었고 0003은 push된 적이 없다.** 로컬과 원격의 투표 정책이 서로 달랐던 것 — 앞으로는 스키마 변경 후 `db push` 여부를 이력으로 확인할 것.
- 원격 연결 절차: 대시보드에서 **Allow anonymous sign-ins ON** → `supabase link --project-ref` → `supabase db push`.
- 스택: Next 16.2 / React 19.2 / TS 5 strict / Tailwind v4 / TanStack Query v5 / Supabase(@supabase/ssr) / zod 4 / lucide-react.
