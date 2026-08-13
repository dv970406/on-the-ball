# 재사용 헬퍼 (중복 구현 금지 · DRY)

새 유틸·계산·포맷을 만들기 전에 **여기 있는 것부터 확인**한다. 같은 로직을 여러 곳에 복붙하지 않는다. 공통 로직이 필요하면 아래 위치에 추가하고 배럴로 노출한다.

## `@/shared/lib/format` (순수 함수 — 서버·클라 공용)
- `formatCount` — 숫자 → `"28,412"`
- **`startOfTodaySeoul`** — 오늘(한국 기준) 00:00의 ISO 시각. "오늘 N개의 글" 같은 하루 경계에 쓴다.
  ⚠ **UTC 자정으로 대신하지 말 것** — 그건 Postgres `current_date`와 맞추기 위한 값이라 한국 사용자에게는 **오전 0~9시 사이 "오늘"이 어제가 된다**. 내부에서 `Date.now()`를 부르므로 렌더 중이 아니라 queryFn 안에서만 호출한다.
- `formatRelativeTime` — 과거 시각 → `"방금 전"`/`"3분 전"`/`"2시간 전"`/`"5일 전"`, 7일↑은 `"7월 30일"`, **해가 다르면 `"2025년 7월 30일"`**.
  - 연도를 붙이는 이유: 전에는 무조건 `"7월 30일"`이라 **작년 글이 올해 글과 구분되지 않았다**(`<time dateTime>`은 정확한데 화면 텍스트만 거짓말).
  - ⚠ **내부에서 `Date.now()`·`new Date()`를 쓴다.** 그런데 실제 호출부(`post-card.tsx`·`post-detail-view.tsx`·`comment-item.tsx`)는 이 함수를 **렌더 중에** 부른다 — 목록·상세가 전부 클라이언트 쿼리라 **SSR HTML이 항상 스켈레톤이어서** 지금은 안전할 뿐이다. 서버 프리페치를 붙이는 순간 깨진다(`data-and-state.md` 하이드레이션 절).
  - ⚠ HOT 판정은 이미 `useNowMs`(마운트 후 값)로 옮겨졌는데 이 함수만 아직 직접 시계를 읽는 **비대칭 상태**다. 프리페치를 붙일 때는 `entities/post/lib/hot.ts` 주석대로 **두 곳을 함께** "서버 기준 시각 주입"으로 바꾼다. 한쪽만 고치면 같은 카드 안에서 기준 시각이 갈린다.

## `@/shared/lib` (배럴 — 클라이언트 훅 포함)
- `cn` — Tailwind 클래스 병합
- **`parsePostId`** — URL의 `[id]` → 게시글 id. **새로 정규식을 만들지 말 것** — proxy(서버 가드)와 페이지가 같은 파서를 써야 판정이 갈리지 않는다(전에 `\d+` vs `Number()`로 갈려 가드가 뚫렸다). 서버에서는 `@/shared/lib/post-id` 직접 경로로.
- **`hasVisibleChar`** — 보이는 글자가 하나라도 있는지. **`.trim()` 대신 이걸 쓴다** — `.trim()`도 Postgres `[:space:]`도 제로폭 문자·BOM을 못 걸러서 "제목이 완전히 비어 보이는 글"이 실제로 만들어졌다. DB의 `public.has_visible_char`와 **문자 집합이 같아야 한다**(한쪽만 고치지 말 것).
- **`normalizeNickname`** — 닉네임 정규형(보이지 않는 문자 제거 · NBSP·전각공백을 보통 공백으로 · 연속 공백 접기). **DB의 `public.normalize_nickname`과 같은 결과를 내야 한다** — 두 문자 집합(`INVISIBLE`/`BLANK`)의 합집합이 `hasVisibleChar`의 클래스와 같아야 한다는 제약까지 한 쌍이다(한쪽만 고치지 말 것).
  ⚠ **닉네임 길이는 원본이 아니라 정규형으로 잰다.** DB 트리거가 쓰기 직전에 정규화하므로 원본으로 재면 화면과 저장값이 갈린다 — ZWJ를 지우는 탓에 가족 이모지(👨‍👩‍👧‍👦)는 저장 시점에 👨👩👧👦 4자로 분해된다.
- **`codePointLength`** — DB `char_length`와 같은 단위의 길이. **`.length`나 `<input maxLength>`로 길이를 제한하지 말 것** — UTF-16 코드유닛이라 이모지가 2로 세어져 한도의 절반에서 막힌다.
- **`graphemeLength`** — 사용자가 세는 "한 글자"(UAX #29 확장 그래핌 클러스터) 기준 길이. **어떤 이모지도 1로 센다** — 가족 ZWJ·피부톤·국기·키캡·태그 시퀀스 전부. `Intl.Segmenter`가 없으면 `codePointLength`로 폴백하는데, 그래핌 ≤ 코드포인트라 폴백은 항상 **더 엄격한** 쪽이어서 DB 거부를 만들지 않는다.
  - ⚠ **본문(20,000자)에는 쓰지 않는다** — 20,000자 기준 1.5ms로 `codePointLength`(0.1ms)의 14배다(실측). 제목 120자는 0.011ms라 렌더 중에도 무해하다.
- **`TextLimit` / `lengthOverflow`** — 길이 한도 **한 쌍**(그래핌=화면 · 코드포인트=DB 정합)과 그 판정. **길이 제한은 이걸로만 건다.**
  - ⚠ **`graphemeLength(v) > MAX`를 직접 짜지 말 것.** 1그래핌의 코드포인트 수에 상한이 없어(`a`+결합악센트 50개 = 그래핌 1 / 코드포인트 51) 그래핌 한도가 DB `char_length` 한도를 함의하지 못한다. 코드포인트 검사를 빠뜨려도 **컴파일·린트·rls 검사 어느 것도 안 잡아주고**, 그 순간 사용자는 한국어 안내 대신 DB의 23514(또는 btree 인덱스의 영어 에러)를 본다. `parsePostId`·`safeNextPath`와 같은 이유로 규약을 함수 하나가 소유한다.
  - 짝이 되는 상수는 features가 갖는다 — `TITLE_LIMIT`(`write-post`)·`COMMENT_LIMIT`(`write-comment`)·`NICKNAME_LIMIT`(`update-profile`). 값 표와 K=10 근거는 `api-and-db.md`.
  - ⚠ **본문만 `TextLimit`이 아니다** — `CONTENT_MAX`(`write-post`, 20,000)는 코드포인트 **단일 값**이고 `lengthOverflow`가 아니라 `codePointLength`로 직접 검사한다. 그래핌을 도입하지 않은 이유(20,000자 계산이 1.5ms)는 `api-and-db.md`에 있다. 본문 길이를 건드릴 때 `TextLimit` 셋만 보고 지나치지 말 것.
- **`useNextParam`** — 현재 URL의 `?next=`. `useSearchParams` 대신 쓴다(그걸 쓰면 화면 프리렌더가 CSR로 떨어진다).
- **`useNowMs`** — 마운트 이후의 현재 시각(ms). 마운트 전에는 `null`.
  렌더 중 `Date.now()`를 부르지 않기 위한 훅이다. **시간에 따라 달라지는 표시(HOT 배지 등)는 이걸로 판정한다** — `null`인 첫 렌더에서는 그 표시를 그리지 않으면 서버·클라 출력이 같아진다. 선례: `entities/post`의 `isHotPost(post, nowMs)`.
- `useScrollRestore` / `clearScrollRestore` — 목록 스크롤 위치 저장/복원 (`clearScrollRestore`는 목록을 처음부터 보여야 할 때 저장분을 버린다)
- `useFocusTrap` — 오버레이(`Dialog`·`Sheet`) 안에 포커스를 가둔다. ⚠ 초기 포커스는 **`preventScroll: true`** 로 준다 — 화면 밖에서 올라오는 시트에 그냥 `focus()`하면 브라우저가 `overflow-hidden`인 430px 프레임을 스크롤시켜 **되돌릴 수 없게** 화면이 밀린다(실측)
- `useToast` / `useToastStore` — 토스트 발행. **표시 영역(`ToastViewport`)은 `@/shared/ui`에 있고 루트에 하나만 둔다** — 상태와 UI가 레이어를 달리한다

> ⚠ **이 배럴에는 호출부가 0인 export를 두지 않는다.** 검증은 `pnpm check:conventions`가 한다(화이트리스트 없이 전수 판정).
> `shared/ui`의 미사용 자산과 **정책이 갈리는데**, 그건 의도한 것이다 — 순수 함수는 git 이력에서 그대로 복원되고(`docs/legacy/v1-inventory.md`가 `design_handoff_ontheball/`에 이미 같은 처리를 한다: "실물은 `6de2618^` 이전 이력에서 꺼낸다"), 배럴 export가 **재사용 목록을 오염시키는 비용**이 더 크다. 컴포넌트는 프로토타입 치수·상태 조합이 함께 사라져 재현 비용이 다르다.
> 실제로 `formatPct`·`formatDday`·`isClosed`·`todayUtc`·`formatYearMonth`·`useDelayedReveal` 6개가 호출부 0인 채 이 목록 최상단에 현역처럼 올라와 있었다.

## `@/types/database.types` (생성 파일 — `pnpm db:types`)
- `Database` — supabase 스키마 전체. **DB 행 타입을 손으로 적지 말고 여기서 뽑는다.**
  ```ts
  export type PostRow = Database["public"]["Tables"]["post"]["Row"];
  ```
- 이미 뽑아 둔 것: `PostRow`/`PostInsert`/`PostUpdate`(`@/entities/post`), `CommentRow`/`CommentInsert`(`@/entities/comment`).

## `@/shared/api`
- `requireBrowserSupabase` — 브라우저 supabase 클라이언트(`SupabaseClient<Database>`, 없으면 한국어 에러 throw). **쿼리·뮤테이션 훅은 이걸 쓴다** — null 가드를 각자 반복하지 않는다.
- `getBrowserSupabase` — null을 그대로 받아 분기해야 할 때만.
- `toDbErrorMessage` — PostgREST/RPC 에러 → 한국어. `P0001`(우리가 띄운 메시지)은 그대로 통과시킨다.
- ⚠ `createSupabaseServerClient`는 배럴에 없다 — `@/shared/api/supabase-server`를 직접 import(`next/headers` 의존).

## `@/entities/session`
- `useSessionStore` — zustand 세션 스토어. 셀렉터로 구독한다.
- `AuthProvider` — `onAuthStateChange` ↔ 스토어 동기화. `QueryClientProvider` 안쪽에 둔다.
- `AuthRequired` / `GuestOnly` — 클라이언트 라우트 가드.
- `toAuthErrorMessage` — supabase `AuthError` → 한국어. **`toDbErrorMessage`와 합치지 않는다**(데이터가 다르다).
  ⚠ 새 인증 흐름을 붙이면 **여기 커버리지부터 확인한다** — identity 코드를 빠뜨렸더니 "이미 다른 계정에 연결됨"처럼 재시도로 절대 안 풀리는 실패가 "잠시 후 다시 시도"로 접혔다.
- **`useLinkedIdentitiesQuery(userId)` / `identityKeys`** — 연결된 로그인 수단 조회. 조회는 여기, 쓰기(연결·해제)는 `features/link-identity`다(`entities/post` ↔ `features/toggle-post-like`와 같은 분업). ⚠ 키를 **userId로 스코프**한다 — 계정 전환 시 이전 사용자의 목록이 노출되지 않게.

## `@/entities/post` · `@/entities/comment`
- `postKeys` / `commentKeys` — 쿼리 키. 낙관적 업데이트가 prefix 매칭에 의존하므로 계층을 지킨다.
- `usePostListQuery` / `usePostQuery` / `useCommentListQuery` / `useTodayPostCountQuery`
- `POST_LIST_LIMIT` / `COMMENT_LIST_LIMIT` — 목록 상한. **화면이 잘림을 안내해야 한다** — 조용히 자르면 그 뒤 항목은 URL을 아는 사람 말고는 도달할 방법이 없다.
- `POST_LIST_SELECT` / `POST_DETAIL_SELECT` / `COMMENT_SELECT` — PostgREST select 문자열의 단일 소스.
  - ⚠ **아바타(`avatar_path`)는 상세·댓글에만 있고 목록에는 일부러 없다** — 목록 카드에 아바타 자리가 없어서다(프로토타입). 누락이 아니니 되넣지 말 것. 그래서 임베딩도 `AUTHOR_EMBED`(목록)와 `AUTHOR_EMBED_DETAIL`(상세)로 갈라져 있다.
  - ⚠ **여기에 profiles 컬럼을 추가하면 `features/update-profile`의 무효화 대상도 함께 늘려야 한다.** 프로필을 바꿔도 이 캐시는 저절로 갱신되지 않아 옛 값이 남는다.
- `buildPostListItem` / `buildPostDetail` / `buildComment` — row(snake) → 도메인(camel).
- `isEdited` — `created_at !== updated_at` 판정("수정됨" 표시).
- **`POST_CATEGORIES` / `POST_SORTS` / `POST_SORT_LABEL`** — 말머리·정렬의 단일 소스. 말머리는 **DB의 `post_category` enum에서 생성된 타입**이라 목록을 손으로 다시 적지 않는다(`Record<PostCategory, ...>` 맵이 값 추가 시 누락을 컴파일 에러로 잡아준다).
- **`isHotPost(post, nowMs)` / `HOT_LIKE_THRESHOLD` / `HOT_WINDOW_MS`** — HOT 배지 판정. **`nowMs`를 인자로 받는 이유**가 규약이다 — 매퍼에 넣으면 순수·서버 안전이 깨지고 같은 행이 호출 시점마다 달라진다. 호출부는 `useNowMs`를 넘긴다.
- **`toPlainSummary` / `clamp`** — 마크다운 원문 → 기호를 걷어낸 요약. 목록 카드의 `excerpt`와 `og:description`이 **같은 변환기**를 쓴다.
- **`buildCommentThreads`** — 평면 댓글 배열 → 깊이 1 스레드(`CommentThread`). 답글 정렬·부모 매칭을 화면에서 다시 짜지 않는다.
- `PostCard` / `CommentItem` — 목록 아이템 UI.
- 서버에서는 배럴 대신 `model/types`·`api/mappers`·`api/keys`·`lib/plain-summary`·`lib/hot`을 직접 import.

## `@/entities/profile`
- `useProfileQuery(userId)` / `profileKeys` / `PROFILE_SELECT` / `buildProfile` — 닉네임·아바타 조회.
- `MyProfile` / `ProfileRow` — 도메인 타입 / DB 행 타입. `MyProfile.avatarPath`는 **경로**다(전체 URL이 아니다).
- ⚠ **`userId`를 인자로 받는다.** 세션을 직접 읽지 않는 이유는 `entities`끼리 서로 import할 수 없기 때문이다 — 세션을 아는 **상위 레이어**(`widgets/auth-status`가 선례)가 `user?.id`를 넘긴다.
- ⚠ **`avatarUrl`은 여기 없다 → `@/shared/config`.** 아바타를 쓰는 곳이 `entities/comment`·`entities/post`(상세)·`views/profile` 셋인데 entities끼리는 import할 수 없다(`OAUTH_PROVIDERS`와 같은 사정).
- 서버에서는 배럴 대신 `model/types`·`api/keys`·`api/mappers`를 직접 import(`post`·`comment`와 같은 형태).

## `@/shared/config`
- `ROUTES` — 경로 헬퍼. **경로 문자열 하드코딩 금지**(`"/posts"` ❌ → `ROUTES.postList`).
- `signInWithNext(pathname)` / `withNext(path, next)` — 복귀 경로를 붙인 URL. proxy(서버 가드)와 클라 가드가 **같은 형태**를 만들어야 하므로 여기로 모았다.
- **`safeNextPath(next, origin)`** — `?next=` 값을 앱 내부 경로로만 통과시킨다. **직접 문자열 검사를 짜지 말 것** — `startsWith("/") && !startsWith("//")`로는 `/\evil.com`도 `/..//evil.com`도 못 막는다(둘 다 실제로 뚫렸다).
- `COLOR` — JS 인라인 style용 색 상수. **토큰 hex 하드코딩 금지**. (`shared/ui/live-status-pill.tsx`가 `COLOR.ink`를 쓴다)
- **`OAUTH_PROVIDERS` / `OAUTH_PROVIDER_LABEL`** — 지원 소셜 프로바이더의 단일 소스. `supabase/config.toml`의 `[auth.external.*]`와 갈리면 안 된다. ⚠ `shared`에 있는 이유는 로그인(`features/sign-in`)과 계정 연결(`features/link-identity`)이 같은 목록을 써야 하는데 features끼리는 import할 수 없어서다.
- **`avatarUrl(path)` / `AVATAR_BUCKET`** — 아바타 **경로** → 공개 URL. ⚠ DB에는 전체 URL이 아니라 경로만 저장한다(호스트가 환경마다 다르다: 로컬 `127.0.0.1:64321` ↔ 원격 `*.supabase.co`). 조립은 이 함수 한 곳에서만. `shared`에 있는 이유는 `OAUTH_PROVIDERS`와 같다 — entities 셋이 함께 쓴다. 버킷명 문자열도 여기서 가져다 쓴다(`features/update-profile`이 선례).
- **`env`** — `NEXT_PUBLIC_*` 환경변수의 단일 소스(`supabaseUrl`·`supabaseAnonKey`·`siteUrl`). **`process.env`를 호출부에서 다시 읽지 말 것** — `proxy.ts`가 화면·훅과 같은 값을 봐야 판정이 갈리지 않는다.
  - `siteUrl`은 `og:image`를 절대 URL로 만드는 `metadataBase`(루트 layout)용이다. `NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` → `localhost:3000` 순으로 폴백한다.
- **`isSupabaseConfigured()`** — env가 채워졌는지. 값이 비어도 빌드는 성공해야 하므로 `env`는 throw하지 않는다 → **가드는 호출부의 책임**이고, 그 가드를 각자 짜지 말고 이걸 쓴다(`proxy.ts`가 선례).

## `@/shared/ui`
**현역(게시판 v2가 실제로 쓰는 것)** — 새로 만들기 전 여기부터 확인:
`Button`·`buttonClassName`·`Icon`·`Skeleton`·`EmptyState`·`Markdown`·
`Chip`·`ActionChip`·`actionChipClassName`·`Dialog`·`Sheet`·`ToastViewport`·`Pill`·`Avatar`·`Wordmark`·`TextField`

**현재 미사용** — 트리셰이킹되어 번들 비용은 0이니 지우지 않는다. 다만 **"검증된 현역"으로 오인하지 말 것**:
`TabHeader`·`MarkdownEditor`·`Flag`·`Shirt`·`RatioBar`·`SectionHead`·`LiveDot`·`LiveStatusPill`·`NightCard`·`PlayerSilhouette`
(`MarkdownEditor`를 뺀 9개가 `docs/legacy/v1-inventory.md`가 보존 대상으로 명시한 v1 자산이다. `MarkdownEditor`는 v2에서 만들었다가 프로토타입에 미리보기 탭이 없어 쓰이지 않는다)

> ⚠ 이 두 목록은 **실사용 여부로만 판정한다** — 손으로 세지 말고 **`pnpm check:conventions`** 를 돌린다(호출부 0인 export를 전수로 뽑아 준다).
> 커뮤니티 이식 때 실제로 어긋났다 — `TabHeader`·`MarkdownEditor`는 현역으로 적혀 있었지만 호출부가 0이었고, 반대로 `Pill`·`Avatar`·`Wordmark`는 v1 미사용으로 적혀 있는 채 화면에서 쓰이고 있었다.
> **이 문서의 존재 이유가 "새로 만들기 전 확인"이라 목록이 틀리면 문서가 없느니만 못하다.** UI를 추가·제거하면 여기부터 고친다.

- `Markdown` — 마크다운 렌더(GFM). `"use client"` **없음** — 서버 렌더 가능.
- `Chip` — 말머리 칩. **`rounded-sm`(6px)** 이다 — 칩이라고 알약이 아니다(`styling.md` 예외 목록 참고).
- `ActionChip` / `actionChipClassName` — 좋아요·댓글 카운터 칩. 클래스 함수가 분리된 이유는 `Button`↔`buttonClassName`과 같다 — 비로그인 좋아요는 `Link`로 렌더해야 하는데 `Link` 안에 `button`을 넣을 수 없어 **클래스만** 필요하다.
- `Dialog` / `Sheet`(+`SheetItem`) — 확인 대화상자 / 하단 시트. 포커스 가둠은 `@/shared/lib`의 `useFocusTrap`.
  - `Sheet`는 화면 하단에 붙는 **edge-to-edge** 시트다(`styling.md`). "닫기" 행을 두지 않는다 — `SheetCloseItem`은 그래서 없앴다.
  - ⚠ 닫기 수단은 스크림 탭 · Escape · 스와이프인데 **셋 다 포인터이거나 물리 키보드다.** 그래서 그래버가 `button aria-label="닫기"`를 겸한다 — 오버플로 메뉴는 남의 글이면 항목이 전부 `disabled`라 **시트 안 활성 컨트롤이 0개**가 되고, 그때 스크린리더·키보드의 유일한 탈출구가 이 버튼이다. `div`로 되돌리지 말 것.
  - ⚠ 진입·퇴장 애니메이션은 **바깥 요소**, 드래그 오프셋은 **안쪽 래퍼**가 갖는다. 한 요소에 겹치면 CSS animation이 캐스케이드에서 inline style을 이겨 드래그가 통째로 무시된다. 새 오버레이에 드래그를 붙일 때 같은 함정을 밟지 말 것.
- `ToastViewport` — 루트(`AppProviders`)에 **하나만** 둔다. 발행 API(`useToast`)는 `@/shared/lib`에 있다.
- `MarkdownEditor` — textarea + 작성/미리보기 탭. **현재 미사용** — 프로토타입에 미리보기 탭이 없어 `PostForm`이 일반 textarea를 쓴다.
- ⚠ `Link` 안에 `Button`을 넣지 않는다(`<a>` 안의 `<button>`). 버튼형 링크는 `buttonClassName({...})`을 `Link`의 className에 준다.

## `@/widgets`
- `AppBar` — 목록 화면 상단(워드마크 + 액션).
- `BottomTabBar` — 하단 탭바. **`backdrop-blur`가 허용된 유일한 요소**다(`styling.md`).
- `SubHeader` — 상세·작성·수정 화면 상단(뒤로가기 + 공유).
- `TabScrollArea` — 목록 스크롤 영역(`<main>` 제공 + 스크롤 복원).
- `AuthShell` — 인증 화면의 공통 껍데기. 소셜 로그인으로 바뀌면서 소비자는 `/sign-in` 하나다.
- `AuthStatus` — 세션 표시 + 로그인 링크 / 로그아웃. 세션을 아는 레이어라 `useProfileQuery(user?.id)`에 id를 넘기는 선례이기도 하다.
  **닉네임이 `/profile` 링크다 — 현재 프로필 화면의 유일한 진입점**(하단 탭바의 "내 활동"에는 아직 라우트가 없다). ⚠ 조회 실패로 닉네임이 비면 라벨 없는 링크가 되므로 폴백 문구를 둔다.
