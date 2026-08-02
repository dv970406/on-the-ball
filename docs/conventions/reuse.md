# 재사용 헬퍼 (중복 구현 금지 · DRY)

새 유틸·계산·포맷을 만들기 전에 **여기 있는 것부터 확인**한다. 같은 로직을 여러 곳에 복붙하지 않는다. 공통 로직이 필요하면 아래 위치에 추가하고 배럴로 노출한다.

## `@/shared/lib/format` (순수 함수 — 서버·클라 공용)
- `formatCount` — 숫자 → `"28,412"`
- `formatPct` — 0~1 비율 → `"57%"`
- `formatDday` — 마감일 → `"D-8"`/`"마감"` (순수 표시용)
- `isClosed` — 마감 여부 boolean 판정 (표시 문자열 비교 금지, 이 함수로 판정)
- `todayUtc` — 오늘 날짜 `"YYYY-MM-DD"`(UTC, Postgres `current_date`와 정합)
- `formatYearMonth` — ISO 날짜 → `"2026.07"`(UTC 기준)
- `formatRelativeTime` — 과거 시각 → `"방금 전"`/`"3분 전"`/`"2시간 전"`/`"5일 전"`, 7일↑은 `"7월 30일"`. ⚠ 내부에서 `Date.now()`·`new Date()`를 쓰므로 **서버 렌더에 넣지 말 것**(hydration 불일치). 클라 마운트 이후에만 렌더한다.

## `@/shared/lib` (배럴 — 클라이언트 훅 포함)
- `cn` — Tailwind 클래스 병합
- **`parsePostId`** — URL의 `[id]` → 게시글 id. **새로 정규식을 만들지 말 것** — proxy(서버 가드)와 페이지가 같은 파서를 써야 판정이 갈리지 않는다(전에 `\d+` vs `Number()`로 갈려 가드가 뚫렸다). 서버에서는 `@/shared/lib/post-id` 직접 경로로.
- **`useNextParam`** — 현재 URL의 `?next=`. `useSearchParams` 대신 쓴다(그걸 쓰면 화면 프리렌더가 CSR로 떨어진다).
- `useScrollRestore` — 목록 스크롤 위치 저장/복원
- `useDelayedReveal` — (v1 자산, 현재 미사용)

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

## `@/entities/post` · `@/entities/comment`
- `postKeys` / `commentKeys` — 쿼리 키. 낙관적 업데이트가 prefix 매칭에 의존하므로 계층을 지킨다.
- `usePostListQuery` / `usePostQuery` / `useCommentListQuery`
- `POST_LIST_SELECT` / `POST_DETAIL_SELECT` / `COMMENT_SELECT` — PostgREST select 문자열의 단일 소스.
- `buildPostListItem` / `buildPostDetail` / `buildComment` — row(snake) → 도메인(camel).
- `isEdited` — `created_at !== updated_at` 판정("수정됨" 표시).
- `PostCard` / `CommentItem` — 목록 아이템 UI.
- 서버에서는 배럴 대신 `model/types`·`api/mappers`·`api/keys`를 직접 import.

## `@/shared/config`
- `ROUTES` — 경로 헬퍼. **경로 문자열 하드코딩 금지**(`"/posts"` ❌ → `ROUTES.postList`).
- `signInWithNext(pathname)` / `withNext(path, next)` — 복귀 경로를 붙인 URL. proxy(서버 가드)와 클라 가드가 **같은 형태**를 만들어야 하므로 여기로 모았다.
- **`safeNextPath(next, origin)`** — `?next=` 값을 앱 내부 경로로만 통과시킨다. **직접 문자열 검사를 짜지 말 것** — `startsWith("/") && !startsWith("//")`로는 `/\evil.com`도 `/..//evil.com`도 못 막는다(둘 다 실제로 뚫렸다).
- `COLOR` — JS 인라인 style용 색 상수. **토큰 hex 하드코딩 금지**. (현재 사용처 없음 — 인라인 style 색이 필요해지면 여기서 가져온다)

## `@/shared/ui`
**현역(게시판 v2가 실제로 쓰는 것)** — 새로 만들기 전 여기부터 확인:
`Button`·`buttonClassName`·`Icon`·`TabHeader`·`Skeleton`·`EmptyState`·`TextField`·`Markdown`·`MarkdownEditor`

**v1 보존 자산(현재 미사용)** — `docs/legacy/v1-inventory.md`가 보존 대상으로 명시한 것들이다. 트리셰이킹되어 번들 비용은 0이니 지우지 않는다. 다만 **"검증된 현역"으로 오인하지 말 것**:
`Pill`·`Flag`·`Shirt`·`Avatar`·`RatioBar`·`SectionHead`·`LiveDot`·`LiveStatusPill`·`NightCard`·`Wordmark`·`PlayerSilhouette`
- `TextField` — 라벨 + 인풋 + 에러 한 덩어리. 인증 화면 4개와 글 작성에서 공유.
- `Markdown` — 마크다운 렌더(GFM). `"use client"` **없음** — 서버 렌더 가능.
- `MarkdownEditor` — textarea + 작성/미리보기 탭.
- ⚠ `Link` 안에 `Button`을 넣지 않는다(`<a>` 안의 `<button>`). 버튼형 링크는 `buttonClassName({...})`을 `Link`의 className에 준다.

## `@/widgets`
- `SubHeader` — 상세·작성·수정 화면 상단(뒤로가기 + 공유).
- `TabScrollArea` — 목록 스크롤 영역(`<main>` 제공 + 스크롤 복원).
- `AuthShell` — 인증 화면 4개의 공통 껍데기.
- `AuthStatus` — 세션 표시 + 로그인 링크 / 로그아웃.
