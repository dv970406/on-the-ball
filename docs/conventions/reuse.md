# 재사용 헬퍼 (중복 구현 금지 · DRY)

새 유틸·계산·포맷을 만들기 전에 **여기 있는 것부터 확인**한다. 같은 로직을 여러 곳에 복붙하지 않는다. 공통 로직이 필요하면 아래 위치에 추가하고 배럴로 노출한다.

## `@/shared/lib/format` (순수 함수 — 서버·클라 공용)
- `formatCount` — 숫자 → `"28,412"`
- `formatRelativeTime(iso, nowMs)` — 과거 시각 → `"방금 전"`/`"3분 전"`/`"2시간 전"`/`"5일 전"`, 7일↑은 `"7월 30일"`, **해가 다르면 `"2025년 7월 30일"`**.
  - 연도를 붙이는 이유: 전에는 무조건 `"7월 30일"`이라 **작년 글이 올해 글과 구분되지 않았다**(`<time dateTime>`은 정확한데 화면 텍스트만 거짓말).
  - ⚠ **`nowMs`를 인자로 받는다**(`isHotPost`와 같은 형태·같은 이유). 렌더 중에 시계를 읽으면 서버 렌더와 하이드레이션이 다른 값을 만든다 — 상세·목록이 모두 SSR이라 실제로 깨진다. 호출부는 `useNowMs()`를 그대로 넘긴다.
  - ⚠ **SSR 화면에서는 서버 시각을 흘려보낸다** — `serverNowMs ?? useNowMs()`. 안 그러면 첫 렌더가 절대시각이었다가 바뀌며 **시프트**한다(글 상세가 실제로 그랬다). ⚠ **순서를 뒤집지 말 것** — `useNowMs()`는 세션당 한 번 고정되어 낡은 값이 갓 받은 서버 시각을 이긴다(`data-and-state.md`).
  - ⚠ **`nowMs`가 `null`이면 절대시각을 돌려준다**(연도 포함). 기준 시각 없이 상대시각을 추측하면 그 순간이 불일치다. 연도를 빼는 쪽이 거짓이 될 수 있어, 모를 때는 붙이는 쪽으로 기운다.

- `formatKickoff(iso, nowMs)` — 킥오프 시각 → `"11월 3일 (일) 04:30"`, 해가 다르면 앞에 연도.
  - ⚠ **`formatRelativeTime`을 킥오프에 쓰지 말 것** — 그쪽은 `nowMs - date`로 과거를 전제해서 **미래 시각이 전부 "방금 전"** 이 된다.
  - ⚠ 요일을 함께 찍는 것이 규약이다. 축구 일정에서 요일은 장식이 아니라 정보다.
  - ⚠ `nowMs` 계약은 형제 함수와 같다 — **연도를 붙일지만** 그 값으로 정하고 `null`이면 항상 붙인다.

- `formatMatchDay(iso, nowMs)` — 경기 목록의 **날짜 헤딩** → `"오늘 (금)"`/`"내일 (토)"`/`"9월 5일 (토)"`, 해가 다르면 앞에 연도.
  - ⚠ **`formatKickoff`을 이걸로 바꾸지 말 것.** 상세는 공유·색인되는 페이지라 "오늘"이 크롤 시점에 굳어 거짓이 된다(`formatRelativeTime` 주석이 남긴 판단) — 날짜 헤딩만 상대 표기를 쓴다.
  - ⚠ 날짜 차이를 ms로 재지 않는다. `(kickoff - now) / 86400000`은 "24시간 뒤"라 오늘 23시와 내일 01시가 같은 날로 접힌다 — 세는 것은 **달력 하루**다.
  - ⚠ `nowMs`가 `null`이면 오늘/내일을 판정할 수 없다 → 연도까지 붙인 절대 날짜(형제 함수와 같은 계약).
- `seoulDayKey(iso)` — KST 달력 하루의 키 `"2026-09-05"`. `groupMatchesByDay`가 그룹 경계를 이걸로 가른다.
  - ⚠ **표시 문구로 묶지 말 것** — 라벨은 해가 다른 같은 날짜에서 똑같아져 1년 떨어진 두 경기가 한 그룹이 된다.
- `formatKickoffTime(iso)` — 킥오프의 시:분만 `"23:00"`. 날짜를 헤딩이 갖는 목록 카드용이고, 날짜까지 필요하면 `formatKickoff`.

## `@/shared/lib` (배럴 — 클라이언트 훅 포함)
- `cn` — Tailwind 클래스 병합
- **`parsePostId`** — URL의 `[id]` → 게시글 id. **새로 정규식을 만들지 말 것** — 같은 id를 해석하는 곳이 여럿이라 파서가 갈리면 `/posts/2`·`/posts/002`·`/posts/2.0`이 같은 글의 별칭 URL이 된다(전에 `\d+` vs `Number()`로 갈려 서버 가드가 뚫린 적도 있다). 서버에서는 `@/shared/lib/post-id` 직접 경로로.
- **`hasVisibleChar`** — 보이는 글자가 하나라도 있는지. **`.trim()` 대신 이걸 쓴다** — `.trim()`도 Postgres `[:space:]`도 제로폭 문자·BOM을 못 걸러서 "제목이 완전히 비어 보이는 글"이 실제로 만들어졌다. DB의 `public.has_visible_char`와 **문자 집합이 같아야 한다**(한쪽만 고치지 말 것).
- **`normalizeNickname`** — **보이는 텍스트의 정규형**(보이지 않는 문자 제거 · NBSP·전각공백을 보통 공백으로 · 연속 공백 접기). 이름은 첫 호출자를 기록할 뿐이고 닉네임 전용이 아니다 — **화면에서 구분되어야 하는 값**은 이걸로 접는다(투표 선택지 `validatePoll`이 두 번째 호출자다). 접지 않으면 `.trim()`을 통과한 '찬성'·'찬성 '·'찬'+제로폭공백+'성'이 서로 다른 값으로 저장되어 똑같이 생긴 항목이 여럿 뜬다. **DB의 `public.normalize_nickname`과 같은 결과를 내야 한다** — 두 문자 집합(`INVISIBLE`/`BLANK`)의 합집합이 `hasVisibleChar`의 클래스와 같아야 한다는 제약까지 한 쌍이다(한쪽만 고치지 말 것).
  ⚠ **닉네임 길이는 원본이 아니라 정규형으로 잰다.** DB 트리거가 쓰기 직전에 정규화하므로 원본으로 재면 화면과 저장값이 갈린다 — ZWJ를 지우는 탓에 가족 이모지(👨‍👩‍👧‍👦)는 저장 시점에 👨👩👧👦 4자로 분해된다.
- **`codePointLength`** — DB `char_length`와 같은 단위의 길이. **`.length`나 `<input maxLength>`로 길이를 제한하지 말 것** — UTF-16 코드유닛이라 이모지가 2로 세어져 한도의 절반에서 막힌다.
- **`clamp(text, max)`** — 코드포인트 단위 말줄임(넘치면 끝에 `…`). **`.slice()`로 직접 자르지 말 것** — UTF-16 코드유닛이라 이모지가 반쪽으로 잘린다. `generateMetadata`의 `<title>` 길이 방어와 `toPlainSummary`가 같은 함수를 쓴다. 서버에서는 `@/shared/lib/text` 직접 경로로.
- **`graphemeLength`** — 사용자가 세는 "한 글자"(UAX #29 확장 그래핌 클러스터) 기준 길이. **어떤 이모지도 1로 센다** — 가족 ZWJ·피부톤·국기·키캡·태그 시퀀스 전부. `Intl.Segmenter`가 없으면 `codePointLength`로 폴백하는데, 그래핌 ≤ 코드포인트라 폴백은 항상 **더 엄격한** 쪽이어서 DB 거부를 만들지 않는다.
  - ⚠ **본문(20,000자)에는 쓰지 않는다** — 20,000자 기준 1.5ms로 `codePointLength`(0.1ms)의 14배다(실측). 제목 120자는 0.011ms라 렌더 중에도 무해하다.
- **`TextLimit` / `lengthOverflow`** — 길이 한도 **한 쌍**(그래핌=화면 · 코드포인트=DB 정합)과 그 판정. **길이 제한은 이걸로만 건다.**
  - ⚠ **`graphemeLength(v) > MAX`를 직접 짜지 말 것.** 1그래핌의 코드포인트 수에 상한이 없어(`a`+결합악센트 50개 = 그래핌 1 / 코드포인트 51) 그래핌 한도가 DB `char_length` 한도를 함의하지 못한다. 코드포인트 검사를 빠뜨려도 **컴파일·린트·rls 검사 어느 것도 안 잡아주고**, 그 순간 사용자는 한국어 안내 대신 DB의 23514(또는 btree 인덱스의 영어 에러)를 본다. `parsePostId`·`safeNextPath`와 같은 이유로 규약을 함수 하나가 소유한다.
  - 짝이 되는 상수는 features가 갖는다 — `TITLE_LIMIT`(`write-post`)·`COMMENT_LIMIT`(`write-comment`)·`NICKNAME_LIMIT`(`update-profile`)·`POLL_QUESTION_LIMIT`/`POLL_OPTION_LIMIT`(`write-post`). 값 표와 K=10 근거는 `api-and-db.md`.
  - ⚠ **본문만 `TextLimit`이 아니다** — `CONTENT_MAX`(`write-post`, 20,000)는 코드포인트 **단일 값**이고 `lengthOverflow`가 아니라 `codePointLength`로 직접 검사한다. 그래핌을 도입하지 않은 이유(20,000자 계산이 1.5ms)는 `api-and-db.md`에 있다. 본문 길이를 건드릴 때 `TextLimit` 셋만 보고 지나치지 말 것.
- **`userScope(userId)`** — 쿼리 키의 사용자 스코프 조각(`undefined` → `"guest"`). ⚠ `"guest"` 리터럴을 호출부가 각자 적지 말 것 — 갈리면 **캐시 키가 조용히 어긋나** 빌드도 린트도 못 잡고 화면만 스켈레톤이 되거나 남의 데이터가 남는다. `pollKeys`·`surveyKeys`·`blockKeys` 셋이 쓴다(entities끼리는 import할 수 없어 `shared`에 있다). ⚠ `userId: string`인 키(`identityKeys`·`profileKeys`)에는 쓰지 않는다. `api/keys.ts`는 서버 소비자라 **직접 경로**로 가져온다.
- **`useNextParam`** — 현재 URL의 `?next=`. `useSearchParams` 대신 쓴다(그걸 쓰면 화면 프리렌더가 CSR로 떨어진다).
  - ⚠ **읽은 값을 렌더에 쓰는 화면**용이다(로그인 화면의 `redirectTo` 조립). 값이 필요한 시점이 **effect 안뿐**이라면 이걸 쓰지 말고 거기서 직접 읽는다 — 이 훅은 `useSyncExternalStore`로 렌더 중에 읽으므로 렌더타임 의존이 새로 생긴다. 라우트 가드(`useRedirectAfterSignIn`)가 그 경우이고, 사유는 그 훅 주석에 있다.
- **`useDuplicateGuard(mutation)`** — 렌더를 기다리지 않는 중복 실행 가드. `{ isLocked, lock }`을 돌려준다. **`ref` + 해제 effect를 직접 짜지 말 것** — `disabled={isPending}`가 왜 부족한지(같은 tick의 두 번째 클릭)가 이 훅의 주석에 모여 있다.
  - ⚠ **`isPending`(boolean)이 아니라 뮤테이션을 통째로 넘긴다.** 해제가 `status`+`submittedAt`에 걸려 있어서다 — boolean은 "아직 시작 전"과 "이미 끝남"을 구분하지 못해, 마이크로태스크만으로 끝나는 실패(동기 `throw`)에서 deps가 `false → false`가 되어 **자물쇠가 영영 풀리지 않았다.**
  - ⚠ **`isPending`을 prop으로 받는 컴포넌트에 두지 말 것.** 부모가 리렌더될 때까지 낡은 값을 읽으므로 같은 무증상 잠금이 된다 → 뮤테이션을 조립하는 쪽에 둔다.
  - ⚠ 확인과 잠금이 **나뉜 이유가 규약이다** — 사이에 끼는 검증이 실패하면 잠그지 않고 빠져나가야 한다. 잠그면 뮤테이션이 시작되지 않아 `isPending`이 돌지 않고, 그 자물쇠는 영영 풀리지 않는다.
  - ⚠ 목록의 **항목별** 가드는 이 훅이 아니다 — 렌더 표시용 상태를 함께 가져야 해서 형태가 다르다. 그리고 해제를 `mutate`의 per-call 콜백에 걸면 **다음 항목을 누르는 순간 앞 항목의 콜백이 유실되어** 무증상 잠금이 된다 → `mutateAsync().finally()`로 건다(사유는 `data-and-state.md`).
- **`useNowMs`** — 클라이언트 시계. 마운트 전에는 `null`.
  - ⚠ **"현재 시각"이 아니다.** 값이 **모듈 스코프에 세션당 한 번** 고정되어(앱을 처음 연 화면에서 굳는다) SPA 세션 내내 그대로다 — `useSyncExternalStore` 계약상 스냅샷이 매번 달라지면 무한 렌더가 되기 때문이다(그 훅 주석).
  - ⚠ **그래서 서버 시각이 있으면 그쪽이 우선이다** — `serverNowMs ?? useNowMs()`. 순서를 뒤집으면 낡은 클라 시계가 갓 받은 서버 시각을 이겨 **마감된 것이 진행 중으로 보인다**(`data-and-state.md`에 실측).
  렌더 중 `Date.now()`를 부르지 않기 위한 훅이다. **시간에 따라 달라지는 표시(HOT 배지 등)는 이걸로 판정한다** — `null`인 첫 렌더에서는 그 표시를 그리지 않으면 서버·클라 출력이 같아진다. 선례: `entities/post`의 `isHotPost(post, nowMs)`.
- **`useQueryNowMs(dataUpdatedAt)`** — **서버 프리페치가 없는 화면**의 기준 시각. 규약은 `serverNowMs ?? useNowMs()`인데 그 앞자리가 비는 화면(어드민 목록 전부)에서는 세션 고정 시계가 유일한 기준이 되어 **방금 만든 것이 과거 시계로 판정된다** — "지금부터" 노출되는 공지를 등록하고 목록으로 돌아오면 `예정`으로 그려졌다(실측). TanStack Query의 `dataUpdatedAt`(그 데이터를 받은 순간)을 쓰면 등록·수정 후의 무효화가 곧 리페치라 판정이 함께 따라온다. ⚠ 데이터가 없으면 `0`이라 그때만 `useNowMs()`로 떨어진다.
- **`resizeToWebp(file)` / `IMAGE_TARGET_BYTES`** — 이미지를 **비율을 유지한 채** webp로 줄인다(결과는 항상 500KB 이하). ⚠ **승격된 함수다** — `features/write-post`에 있었고 그 주석이 "세 번째 이미지 기능이 생기면 올린다"고 예고했다(어드민 입축구 배경이 그 세 번째이고, features끼리는 import할 수 없어 승격 말고 길이 없다). ⚠ `resizeToAvatar`(정사각 crop)는 **함께 올리지 않았다** — 본문·배경 사진을 그렇게 자르면 내용이 날아가 형태가 같지 않다. ⚠ 받는 형식·원본 상한(`ACCEPTED_IMAGE_TYPES`·`MAX_SOURCE_BYTES`)은 **기능마다 다르므로** 각 feature가 갖는다(본문은 움직이는 GIF를 받고 입축구 배경은 안 받는다).
- **`toKstInputValue(iso)` / `fromKstInputValue(value)`** — `<input type="datetime-local">` ↔ ISO. ⚠ **양방향을 KST로 못박는다** — `datetime-local`에는 타임존이 없어 `new Date(value)`로 파싱하면 **브라우저 로컬 시간대**로 해석되는데, 화면은 전부 KST로 그린다(`format.ts`의 `TIME_ZONE`). 해외에서 접속한 관리자가 킥오프를 넣으면 표기와 몇 시간씩 어긋난다. ⚠ 승부예측(킥오프)·입축구(마감)·공지(노출 기간) 셋이 쓰므로 `shared`에 있다.
- `useScrollRestore` / `clearScrollRestore` — 목록 스크롤 위치 저장/복원 (`clearScrollRestore`는 목록을 처음부터 보여야 할 때 저장분을 버린다)
- `useFocusTrap` — 오버레이(`Dialog`·`Sheet`) 안에 포커스를 가둔다. ⚠ 초기 포커스는 **`preventScroll: true`** 로 준다 — 화면 밖에서 올라오는 시트에 그냥 `focus()`하면 브라우저가 `overflow-hidden`인 430px 프레임을 스크롤시켜 **되돌릴 수 없게** 화면이 밀린다(실측)
- `useToast` / `useToastStore` — 토스트 발행. **표시 영역(`ToastViewport`)은 `@/shared/ui`에 있고 루트에 하나만 둔다** — 상태와 UI가 레이어를 달리한다

> ⚠ **이 배럴에는 호출부가 0인 export를 두지 않는다.** 검증은 `pnpm check:conventions`가 한다(화이트리스트 없이 전수 판정).
> `shared/ui`의 미사용 자산과 **정책이 갈리는데**, 그건 의도한 것이다 — 순수 함수는 git 이력에서 그대로 복원되고(`docs/legacy/v1-inventory.md`가 v1 자산에 이미 같은 처리를 한다: "실물은 이전 이력에서 꺼낸다"), 배럴 export가 **재사용 목록을 오염시키는 비용**이 더 크다. 컴포넌트는 프로토타입 치수·상태 조합이 함께 사라져 재현 비용이 다르다.

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
- **`createSupabaseAnonClient` / `ANON_REVALIDATE`** (`@/shared/api/supabase-anon` 직접 경로) — 쿠키를 읽지 않는 서버 클라이언트. fetch가 Next Data Cache를 타므로 **응답이 모든 익명 요청에 동일한 조회에만** 쓴다. 새로 만들지 말 것 — 수명 상수가 TanStack `staleTime`과 한 값으로 묶여 있다(`nextjs.md`). ⚠ 캐시 히트가 DB를 없애는 것이지 **왕복이 0이 되는 것은 아니다** — in-flight 중복 제거가 없어 캐시가 빈 순간의 동시 요청은 전부 통과한다.
- **`hasSessionCookie()`** (같은 자리, `supabase-server`) — 이 요청에 세션이 있는지를 **네트워크 없이** 판정. 위 두 클라이언트를 고르는 데만 쓴다. ⚠ `getUser()`로 바꾸지 말 것(로그인 사용자에게 GoTrue 왕복이 하나 더 붙는다). ⚠ 판정을 **좁히지 말 것** — 넓게 잡혀 있어야 헛짚어도 평소 경로로 갈 뿐이고, 좁히면 로그인 사용자가 좋아요 상태·차단 숨김이 빠진 익명 목록을 받는다.

## `@/entities/session`
- `useSessionStore` — zustand 세션 스토어. 셀렉터로 구독한다.
- `AuthProvider` — 세션 동기화의 마운트 지점. `QueryClientProvider` 안쪽에 둔다.
  로직은 `use-session-sync`(`onAuthStateChange` ↔ 스토어 + 유저 전환 시 캐시 리싱크)와
  `use-server-session-check`(로그인 시 1회 서버 검증)가 나눠 갖는다.
- `AuthRequired` / `GuestOnly` — 클라이언트 라우트 가드. 렌더 분기만 갖고,
  **이동은 `use-auth-redirect`가 소유한다** — 로그인 후 목적지를 정하는 곳은 앱에서 거기 하나다.
- **`useLastAuthProvider()`** — 마지막으로 로그인에 성공한 소셜 프로바이더(로그인 화면의 "최근 사용" 배지). ⚠ 순수 리더가 아니라 **훅**을 노출한다 — 그대로 내보내면 호출부마다 "렌더 중에 부르면 하이드레이션이 깨진다"를 기억해야 하는데 그런 방어는 방어가 아니다(`useNextParam`과 같은 형태).
- **`markSignOutIntent()` / `clearSignOutIntent()`** — "사용자가 직접 로그아웃했다"는 1회성 신호. `features/sign-out`이 **`signOut()`을 부르기 전에** 찍고, 실패하면 버린다. 가드가 이걸 보고 목적지를 가른다(직접 로그아웃 → 목록 / 세션 만료·비로그인 진입 → 로그인 화면 + `?next=`).
  ⚠ **로그아웃 후 이동을 호출부에서 하지 말 것** — 성공 콜백은 화면이 먼저 언마운트되어 실행되지 않고, `mutate` 직전 `router.replace`는 가드의 이동과 순서 보장이 없다(나중 이동이 앞 이동을 취소한다). 목적지는 가드가 소유하고 호출부는 신호만 남긴다.
  ⚠ **신호는 전역이고 가드는 여럿이다** — 가드가 쓰지 않을 때도 읽어서 버리고, "이 화면에서 세션이 사라졌는가"를 함께 본다. 안 그러면 남은 신호를 다른 가드(`/posts/new` 등)가 먹어 비로그인 사용자가 로그인 화면 대신 목록으로 되튕긴다.
- `toAuthErrorMessage` — supabase `AuthError` → 한국어. **`toDbErrorMessage`와 합치지 않는다**(데이터가 다르다).
  ⚠ 새 인증 흐름을 붙이면 **여기 커버리지부터 확인한다** — identity 코드를 빠뜨렸더니 "이미 다른 계정에 연결됨"처럼 재시도로 절대 안 풀리는 실패가 "잠시 후 다시 시도"로 접혔다.
- **`useLinkedIdentitiesQuery(userId)` / `identityKeys`** — 연결된 로그인 수단 조회. 조회는 여기, 쓰기(연결·해제)는 `features/link-identity`다(`entities/post` ↔ `features/toggle-post-like`와 같은 분업). ⚠ 키를 **userId로 스코프**한다 — 계정 전환 시 이전 사용자의 목록이 노출되지 않게.

## `@/entities/post` · `@/entities/comment`
- `postKeys` / `commentKeys` — 쿼리 키. 낙관적 업데이트가 prefix 매칭에 의존하므로 계층을 지킨다.
- `usePostListQuery` / `usePostQuery` / `useCommentListQuery`
- **`buildCommentListQuery(supabase, postId)`** — 댓글 목록 조립의 단일 소스(`entities/comment/api/list-query.ts` — 서버 안전). ⚠ 상수만 공유하고 `order`를 서버·훅이 각자 적으면 어긋날 자리가 남는다 — **정렬까지 이 함수가 소유한다.**
- `POST_LIST_LIMIT` / `COMMENT_LIST_LIMIT` — 목록 상한. **화면이 잘림을 안내해야 한다** — 조용히 자르면 그 뒤 항목은 URL을 아는 사람 말고는 도달할 방법이 없다.
- `POST_LIST_SELECT` / `POST_DETAIL_SELECT` / `COMMENT_SELECT` — PostgREST select 문자열의 단일 소스.
  - ⚠ **아바타(`avatar_path`)는 상세·댓글에만 있고 목록에는 일부러 없다** — 목록 카드에 아바타 자리가 없어서다(프로토타입). 누락이 아니니 되넣지 말 것. 그래서 임베딩도 `AUTHOR_EMBED`(목록)와 `AUTHOR_EMBED_DETAIL`(상세)로 갈라져 있다.
  - ⚠ **여기에 profiles 컬럼을 추가하면 `features/update-profile`의 무효화 대상도 함께 늘려야 한다.** 프로필을 바꿔도 이 캐시는 저절로 갱신되지 않아 옛 값이 남는다.
- `buildPostListItem` / `buildPostDetail` / `buildComment` — row(snake) → 도메인(camel).
- `isEdited` — `created_at !== updated_at` 판정("수정됨" 표시).
- **`POST_CATEGORY_SLUG` / `categoryFromSlug(slug)` / `parsePostSort(value)`** — 말머리 ↔ URL 슬러그, 정렬 문자열 해석. **역방향 판정을 호출부가 직접 짜지 말 것** — 링크를 만드는 곳과 URL을 해석하는 곳이 갈리면 조용히 404가 난다(`parsePostId`·`safeNextPath`와 같은 이유). ⚠ **슬러그 값은 영구 계약이다** — 바꾸면 기존 링크와 색인이 깨진다. ⚠ 모르는 슬러그는 `null`(호출부가 404), 모르는 정렬은 **기본값 폴백**이다(파라미터 오염이 404를 양산하면 안 된다).
- **`buildPostListQuery(supabase, { category, sort })`** — 목록 쿼리 조립의 단일 소스(`api/list-query.ts` — 서버 안전). 훅과 SSR 페이지가 **같은 함수**를 부른다. ⚠ 서버가 정렬·상한·select를 다시 짜면 하이드레이션 직후 목록이 재배열된다. ⚠ 필터 객체는 **훅과 키가 하나도 더도 덜도 아니어야** 한다 — `postKeys.list`가 그대로 해시하므로 하나만 달라도 `initialData`가 캐시에 닿지 못한다.
- **`POST_LIST_LIMIT`은 `api/mappers.ts`에 있다**(`api/queries.ts`는 `"use client"`라 서버가 못 읽는다). `COMMENT_LIST_LIMIT`·`SURVEY_LIST_LIMIT`도 같은 이유로 같은 자리다.
- **`POST_CATEGORIES` / `POST_SORTS` / `POST_SORT_LABEL`** — 말머리·정렬의 단일 소스. 말머리는 **DB의 `post_category` enum에서 생성된 타입**이라 목록을 손으로 다시 적지 않는다(`Record<PostCategory, ...>` 맵이 값 추가 시 누락을 컴파일 에러로 잡아준다).
- **`isHotPost(post, nowMs)` / `HOT_LIKE_THRESHOLD` / `HOT_WINDOW_MS`** — HOT 배지 판정. **`nowMs`를 인자로 받는 이유**가 규약이다 — 매퍼에 넣으면 순수·서버 안전이 깨지고 같은 행이 호출 시점마다 달라진다. 호출부는 `useNowMs`를 넘긴다.
- **`toPlainSummary`** — 마크다운 원문 → 기호를 걷어낸 요약. 목록 카드의 `excerpt`와 `og:description`이 **같은 변환기**를 쓴다. ⚠ 말줄임은 여기 없다 → `@/shared/lib`의 `clamp`(도메인을 모르는 순수 함수라 소비처가 셋이 되면서 승격했다).
- **`buildCommentThreads`** — 평면 댓글 배열 → 깊이 1 스레드(`CommentThread`). 답글 정렬·부모 매칭을 화면에서 다시 짜지 않는다.
- `PostCard` / `CommentItem` — 목록 아이템 UI.
- 서버에서는 배럴 대신 `model/types`·`api/mappers`·`api/keys`·`api/list-query`·`lib/plain-summary`·`lib/hot`을 직접 import.

## `@/entities/poll`
- `usePollQuery(postId, userId)` — 글에 딸린 투표. 없으면 `null`(투표 없는 글이 대부분이라 정상값이다).
- `usePollResultsQuery(postId, userId, enabled)` — 선택지별 득표수.
  ⚠ **투표한 사람에게만 열린다.** 게이팅이 화면이 아니라 `post_poll_results` 함수 안에 있어, 미투표자에게는 0행이 오고 비로그인은 EXECUTE 권한 자체가 없다. `enabled`는 요청을 아끼는 것일 뿐 방어가 아니다.
- `pollKeys` — ⚠ **`postId`와 `userId`를 함께** 받는다. `myOptionId`도 집계도 "나"에 종속된 값이라, 상세를 연 채 계정이 바뀌면 이전 사용자의 것이 남는다(`identityKeys`와 같은 이유).
- `POLL_SELECT` / `buildPoll` / `buildPollResult` — PostgREST select 문자열의 단일 소스와 매퍼.
  ⚠ **득표수가 select에 없다.** 컬럼이 아니라 함수가 세기 때문이다 — 여기에 넣으려고 컬럼을 만들면 게이팅이 무너진다.
- `Poll` / `PollResult` — 도메인 타입. `Poll.myOptionId`는 `post_poll_vote` 임베딩이 "내 행만"이라 **배열 길이가 곧 그 값**이다(`post_like` 트릭과 같다).
- `PollBlock` — 투표 UI. **프레젠테이션 전용이라 세션도 뮤테이션도 모른다.** 세션 3분기와 실제 투표는 `features/cast-poll-vote`의 `PollVote`가 갖는다(`PostCard` ↔ `LikeButton`과 같은 분업).
- ⚠ **`entities/post`가 아니라 별도 슬라이스다.** 임베딩하면 poll 타입과 낙관적 스냅샷이 `PostDetail` 안에 중첩되어 post가 투표 도메인을 떠안는다. 대가로 상세 화면에 요청이 하나 는다.

## `@/features/cast-poll-vote`
- `PollVote` — `PollBlock`에 세션과 뮤테이션을 붙인 컴포넌트. ⚠ 세션 `status`를 **3분기**한다(`loading`을 비로그인과 같이 다루면 콜드 로드 직후 로그인 사용자가 로그인 안내를 본다 — `LikeButton`·`CommentBar`와 판정을 맞춘다).
- ⚠ **비로그인에게도 선택지를 연결한다** — 눌러야 로그인 안내가 뜬다(`SurveyVote`와 같은 형태). 선택지를 죽이고 아래에 "로그인하고 투표하기" 링크를 다는 형태로 되돌리지 말 것: 사용자가 실제로 누르는 것은 선택지라 **눌러도 아무 반응이 없는 UI**가 된다.
- ⚠ **팝업은 뷰가 소유한다**(`onSignInRequired` 콜백으로 올린다) — 사유는 `cast-survey-vote`와 같다.
- ⚠ 투표하기에는 **RPC가 없다.** 집계 컬럼이 없어 지킬 불변조건이 행 하나뿐이라 잠금이 필요 없다. 다만 **PostgREST upsert도 쓰지 않는다** — payload 전 컬럼에 UPDATE 권한을 요구해서 `post_id`를 열게 되고, 그러면 표를 다른 글로 옮겨 "취소 불가"가 뚫린다.

## `@/entities/survey`
> ⚠ **한국어로 부를 때는 "입축구", 영문 식별자는 `survey`.** 이 기능을 가리키는 한국어는
> 화면·주석·문서 어디서든 "입축구" 하나다 — "서베이"와 섞어 쓰지 않는다. 반대로
> `survey`·`surveyKeys`·`SurveyBlock`·`/surveys`·`survey_vote`는 그대로 둔다.
> URL은 사이트맵에 실린 영구 계약이고(`nextjs.md`), 테이블·RPC까지 개명하면 마이그레이션이
> 줄줄이 딸려온다. 그래서 한 문장에 둘이 함께 나오는 것이 정상이다 —
> "입축구(`survey`·`survey_option`)가 그 자리다".
> ⚠ **예외는 이미 적용된 마이그레이션뿐이다** — `supabase/migrations/`는 주석이라도 고치지
> 않는다("원격에 적용된 마이그레이션은 수정하지 않고 새 파일로 추가한다", `api-and-db.md`).
> 그 파일들에는 "서베이"가 남아 있고, 그게 유일하게 남아도 되는 자리다.
> ⚠ 조사는 손으로 붙이지 않는다 — `StaleBanner`가 받침으로 판정한다("입축구**를**").

- `useSurveyListQuery(userId, enabled, initialData)` / `useSurveyQuery(id, userId, enabled, initialData)` / `useSurveyResultsQuery(id, userId, enabled, initialData)` — 목록 · 단건 · 집계.
  - ⚠ `initialData`는 **서버 프리페치의 결과**다. 넘길 때는 **키의 `userId`도 서버가 준 값**이어야 하고 `enabled`도 함께 열어야 한다 — 하나라도 어긋나면 서버가 그린 HTML을 첫 프레임에 스켈레톤이 덮는다(실측). 사유는 `nextjs.md`.
- `surveyKeys` / `SURVEY_LIST_LIMIT` / `Survey` · `SurveyListItem` · `SurveyResult` / `SurveyCard` · `SurveyBlock`.
- **`buildSurveyListQuery(supabase)`** — 목록 쿼리 조립의 단일 소스(`api/list-query.ts` — 서버 안전). 훅과 SSR 페이지가 **같은 함수**를 부른다(`buildPostListQuery`와 같은 규약·같은 이유).
- ⚠ **`entities/poll`과 합치지 않았다.** 부모가 다르고(글에 딸림 ↔ 독립) 목록 계층 유무도 다르다. 무엇보다 entities끼리는 import할 수 없어 `PollBlock`을 재사용하는 길 자체가 없다 — 3번째 소비자가 생기면 그때 `shared/ui`로 올린다(`code-quality.md`의 공용화 기준).
- ⚠ **키를 `userId`로 스코프한다 — 목록까지 그렇다.** 카드의 "참여 완료"가 `survey_vote` 임베딩("내 행만")에서 오므로 목록 응답 자체가 "나"에 종속된다. `pollKeys`·`blockKeys`와 같은 이유.
- ⚠ **참여자 수를 목록에서 그리지 않는다.** 득표수 컬럼이 없어 집계는 `survey_results`를 거쳐야 하는데 그건 참여자에게만 열린다 — 목록에서 부르면 미참여자에게 0이 나가 화면이 거짓말을 한다.
- **`isSurveyOpen(survey, nowMs)`** — 마감 판정. ⚠ `nowMs`를 인자로 받는 이유가 규약이다(`isHotPost`와 같다). 호출부는 `useNowMs()`를 넘기고 **`null`은 "아직 판정 전"** 으로 다룬다 — `false`로 접으면 첫 프레임에 멀쩡한 입축구가 마감으로 보인다. ⚠ 이 판정은 안내일 뿐이고 실제 차단은 `survey_is_open` 정책이 한다.
- ⚠ `SurveyBlock`은 **제목을 렌더하지 않는다**(`PollBlock`과 갈리는 유일한 지점). 입축구는 `title`이 곧 화면의 `h1`이라 뷰가 소유한다.
- **`SplitCard` / `splitCount(options)`** — 선택지를 **면적으로 등분한** 분할 카드와 그 판정.
  - ⚠ **`splitCount`가 "분할 카드로 그릴 문항인가"를 단독으로 소유한다.** 목록과 상세가 같은 `SurveyVote`를 공유하므로 판정 지점이 하나뿐인데, 그 하나를 함수로 둬야 새 소비자가 생겨도 답이 갈리지 않는다. 판별자는 `bg_color`의 유무이고, layout enum을 두지 않은 이유는 `api-and-db.md`에.
  - ⚠ 도형(clip-path·텍스트 앵커·이름 크기)은 `lib/split-layout`이 **한 곳에서** 내려준다. 흩어지면 선택지 수를 늘렸을 때 조용히 어긋난다.
  - ⚠ **3분할은 아래 두 팔이 좌우 변(83.33%)에 닿는다.** 바닥 모서리로 보내면 하단이 큰 삼각형이 되어 면적은 1/3인데도 화면을 지배한다. 접합점 y와 팔 높이는 **합이 4/3이면** 등분되는데 (50%, 83.33%)가 하단을 얕은 띠로 만든다.
  - ⚠ **세 도형의 접합점은 전부 카드 정중앙이다** — `VsBadge`가 그 불변식에 기대어 위치를 고정한다. 폴리곤을 고칠 때 깨면 배지가 시임에서 떨어진다.
  - ⚠ clip-path는 **완성된 클래스 문자열**이라야 한다(Tailwind 스캐너). 사유는 `styling.md`.
  - ⚠ **면 배경은 `image_path` > `bg_color` 순이다.** 이미지가 있어도 색을 지우지 않고 아래에 깔아 둔다 — 이미지가 아직 안 왔거나 실패하면 면이 투명해져 카드가 깨진다. 사진 위에는 `text_color`에 맞춘 스크림을 덮어 최소 대비를 남긴다.
- 서버에서는 배럴 대신 `model/types`·`api/keys`·`api/mappers`를 직접 import.

## `@/features/cast-survey-vote`
- `SurveyVote` — `SurveyBlock`에 세션과 뮤테이션을 붙인 컴포넌트. 조회는 `@/entities/survey`다(`PollVote`와 같은 분업).
- ⚠ 세션 `status`를 **3분기**한다(`loading`을 비로그인과 같이 다루면 콜드 로드 직후 로그인 사용자가 로그인 안내를 본다).
- ⚠ **비로그인에게도 선택지를 연결한다** — 눌러야 로그인 안내가 뜬다. 읽기 전용으로 두면 "왜 안 눌리지"가 되고 별도 안내 링크를 다시 붙여야 한다. 읽기 전용은 마감된 입축구뿐이다.
- ⚠ **안내(`SignInDialog`)는 이 컴포넌트가 아니라 뷰가 소유한다**(`onSignInRequired` 콜백으로 올린다). `Dialog`는 `absolute`라 `TabScrollArea`의 relative 스크롤 영역 안에 두면 스크롤한 만큼 화면 밖에 뜨고, 목록에는 카드 수만큼 생긴다 — `ToastViewport`를 루트에 하나만 두는 것과 같은 이유다.
- ⚠ **무효화 대상이 `cast-poll-vote`보다 하나 많다** — 목록 카드가 "참여 완료"를 표시하므로 `surveyKeys.lists()`도 함께 지운다. 빼면 참여하고 목록으로 돌아왔을 때 배지가 갱신되지 않는다.
- ⚠ 참여하기에는 **RPC가 없고 PostgREST upsert도 쓰지 않는다** — 사유는 `cast-poll-vote`와 같다(집계 컬럼이 없어 잠금이 불필요하고, upsert는 `survey_id` UPDATE 권한을 요구해 "취소 불가"를 뚫는다).

## `@/entities/match`
> ⚠ **한국어로 부를 때는 "승부예측", 영문 식별자는 `match`·`prediction`.** `/matches` URL과
> `match_prediction` 테이블은 그대로 두고, 화면·주석·문서의 한국어는 "승부예측" 하나로 쓴다
> ("경기 예측"·"매치 예측"과 섞지 않는다). 입축구(`survey`)와 같은 형태의 규약이다.

- `useMatchListQuery(userId, enabled, initialData)` / `useMatchQuery(id, userId, enabled, initialData)` / `useMatchPredictionResultsQuery(id, userId, enabled, initialData)` — 목록 · 단건 · 예측 분포.
- **`useMyAccuracyQuery(userId)`** — 내 적중률. ⚠ **`truncated`를 함께 돌려준다** — PostgREST의 `max_rows`(1,000)에 잘리면 비율이 거짓이 되므로 호출부가 그때는 숫자를 그리지 않고 사실을 알린다(실측: 행 1000 / `Content-Range` 총계 1108). 도달하면 세는 일을 DB로 내린다. ⚠ **컬럼이 아니라 그때그때 센다** — 카운터를 흔드는 경로가 다섯이라(예측 생성·변경·채점·**스코어 정정**·무효화, 그리고 탈퇴 cascade) `like_count`가 겪은 어긋남을 그대로 되풀이한다. ⚠ `match!inner`가 필수다(왼쪽 조인이면 경기 없는 행이 `result` null과 섞인다).
- `matchKeys` / `Match` · `MatchListPage` · `MatchPick` · `MatchPredictionResult` · `MatchLineup` · `MatchEvent` · `MatchStat` / `MatchCard` · `TeamCrest` · `PredictionBlock` · `LineupPitch` · `LineupBench` · `StatComparison` / `buildPlayerMarks` · `buildStatRows`.
  ⚠ `MATCH_PICKS`·`MATCH_PICK_LABEL`·`Team`·`PredictionAccuracy`·`LineupPlayer`·`PlayerMarks`·`StatRow`·`playerPhotoUrl`은 **배럴에 없다** — 슬라이스 밖 소비자가 0이라 올리지 않았다(`entities/survey`가 `SurveyOption`·`SplitCount`를 뺀 것과 같은 이유). `check:conventions`는 상대 경로 소비를 현역으로 세어 **이 유형을 잡지 못하므로** 손으로 지킨다.
- ⚠ **`Team.name`은 한국어다**(DB에 그렇게 저장된다 — 사유는 `api-and-db.md`). 화면에서 옮기지 말 것. ⚠ `name`(정식)과 `shortName`(약칭)의 쓰임이 다르다 — **상세 제목만 정식명이고 목록 카드와 예측 버튼은 약칭**이다. 좁은 폭에 좌우로 두 팀을 놓는 자리에서 정식명은 잘리는데 **잘린 팀 이름은 고를 수가 없다.** 상세가 정식명을 감당하는 것은 엠블럼을 이름 **위**에 얹어 가로 폭을 이름에 전부 내주기 때문이다. 표기 추가는 `scripts/team-names-ko.json`.
- **`TeamCrest`** — 구단 엠블럼 + 폴백. **엠블럼은 DB에 없다** — `public/crests/{team.code}.png`를 `team.code`에서 유도한다(사유는 `api-and-db.md`). ⚠ **직접 `<img>`로 그리지 말 것** — 폴백이 두 갈래인데 둘 다 필요하다: 팀 코드가 비었을 때와, **파일이 없어 404일 때**(승격팀이 생기면 반드시 겪는다). ⚠ `onError`만으로는 부족하다 — SSR HTML의 `<img>`는 **하이드레이션 전에** 실패할 수 있고 그러면 이벤트가 지나가 버린다(마운트 시 `complete && naturalWidth === 0`을 함께 확인하는 이유). ⚠ `Avatar`로 대신하지 말 것 — `rounded-full` + `object-cover`라 방패 모양 엠블럼의 모서리가 잘린다. ⚠ 자산을 새로 뽑을 때는 `scripts/fetch-team-crests.mjs`를 쓴다 — 크기·포맷·품질의 근거가 거기 있고, 손으로 만든 파일은 그 판단과 갈린다.
- **`PlayerPhoto`** — 선수 얼굴 + 폴백. 주소를 `player.external_id`에서 유도한다(`lib/player-photo` — 컬럼을 두지 않는 것은 `TeamCrest`와 같은 판단이다). ⚠ **`TeamCrest`와 갈리는 지점이 둘이다.** ① `next/image`를 쓴다 — 엠블럼은 우리가 이미 128px로 줄여 커밋한 자산이라 파이프라인이 줄 이득이 없지만, 사진은 제공자 원본(150px·평균 28KB)이 그대로 와서 한 경기 40장이 **1.07MB**였다. 그 CDN은 리사이즈 파라미터를 **전부 403으로 거부**하고 포맷 협상도 하지 않아(실측) 우리가 줄이는 수밖에 없다(`next.config.ts`의 `remotePatterns`에 호스트를 등재해야 동작한다). ② 폴백이 **실루엣**이다 — 호출부가 등번호를 이미 따로 그리므로 폴백에도 번호를 넣으면 두 번 찍힌다. ⚠ `onError`만으로 부족한 것은 `TeamCrest`와 같다(하이드레이션 전 실패 — `next/image`도 `forwardRef`로 ref를 넘겨 주어 같은 판정이 선다). ⚠ **권리 확인이 남아 있고, 그 통제는 플래그가 진다** — `env.showPlayerPhotos`(`NEXT_PUBLIC_SHOW_PLAYER_PHOTOS`)가 **기본 꺼짐**이라 값이 없는 환경은 자동으로 실루엣으로 그린다. 판정은 `playerPhotoUrl`이 단독으로 갖는다(호출부가 각자 기억하는 방어는 방어가 아니다) — 새 호출부를 만들 때 플래그를 다시 볼 필요가 없다는 뜻이다. 제공자가 이 자산의 권리자가 아니라는 사실과 켤 때의 판단은 `api-and-db.md`.
- **`buildPlayerMarks(events)`** — 사건 → 선수별 표시(득점·자책골·카드·교체). ⚠ **`kind === "goal"`이 곧 득점이 아니다** — 실축 페널티가 같은 타입으로 오고 **VAR로 취소된 페널티에는 선수 없는 골 이벤트가 딸려 온다**(실측). ⚠ 카드는 **단조 승격만** 한다 — `else if`로 두면 `Red` 뒤에 온 `Yellow`가 퇴장을 경고로 **강등시킨다**. ⚠ `detail`이 null이어도 카드는 남긴다(동기화가 실제로 null을 쓴다) — "카드가 있었다"가 "무슨 카드였나"보다 먼저다.
- **`buildStatRows(stats)` / `barPercent`** — 스탯 표 조립. ⚠ **호출부가 이 함수로 "그릴 게 있는가"를 판정한다** — 원본 행 수로 세면 표시 목록에 없는 키만 저장된 경기에서 표는 비고 출처 문구만 남는다. ⚠ `barPercent`는 **음수를 0으로 접는다** — `width: "-50%"`를 CSS가 거부해 `auto`가 되고 블록이라 막대가 **가득 찬다**(제공자의 `goals_prevented`는 실제로 음수가 된다).
- **`buildMatchListQueries(supabase, nowMs)`** — 목록 조립의 단일 소스(`api/list-query.ts` — 서버 안전). **지난/다가오는 두 쿼리를 돌려준다** — 구역이 조회 조건으로 갈리므로 화면이 클라이언트 시계로 다시 나누지 않는다(그러면 조회 기준과 표시 기준이 서로 다른 순간을 본다). ⚠ **기준 시각을 인자로 받는다** — 안에서 시계를 읽으면 훅과 서버가 다른 순간을 보게 되어 경계에 걸친 경기가 한쪽에만 실린다.
- **`MATCH_PAST_LIMIT` / `MATCH_UPCOMING_LIMIT`** — **구역별** 상한. ⚠ **하나로 합치지 말 것** — 상한 하나에 킥오프 오름차순으로 뒀더니 혼잡기에 지난 경기가 상한을 다 먹어 **다가오는 경기가 0건**이 됐다(실측). 예측할 대상이 화면에서 사라지는 방향이다.
- `MATCH_LIST_LOOKBACK_MS` — 지난 경기 구역의 창(**배럴에 없다** — 소비처가 `api/list-query` 하나다. 필요하면 `api/mappers` 직접 경로). ⚠ **7일보다 짧게 두지 말 것** — EPL은 라운드가 주 단위라 3일로 뒀더니 주중 접속 시 지난 라운드 결과가 통째로 창 밖으로 밀려났다(실측).
- **`isPredictionResultsOpen(match, nowMs)`** — 예측 **분포**를 볼 수 있는가(킥오프 지남 + 취소 아님).
  - ⚠ **`!isMatchOpen(...)`으로 대신하지 말 것.** 취소가 두 판정에 다르게 작용해 **뒤집기로 합성되지 않는다** — 실제로 그렇게 고쳤다가 취소된 경기에 "취소된 경기예요"와 분포 패널이 함께 떴고, **취소된 미래 경기**에서는 게이팅된 0행이 `[]`로 접혀 "0명이 예측했어요"라는 거짓말이 됐다.
  - ⚠ **서버(SSR 프리페치)와 클라이언트가 이 함수 하나를 부른다.** 각자 조건을 조립하면 서버가 내려준 `initialData`가 클라이언트 게이팅을 조용히 우회해 `undefined`(볼 수 없음)/`[]`(열렸는데 0건) 구분이 그 지점에서 무너진다.
- **`isMatchOpen(match, nowMs)`** — 예측 마감 판정. **DB의 `match_is_open`과 같은 판정**이어야 한다. ⚠ `nowMs`가 `null`이면 "아직 판정 전"이다(`false`로 접으면 첫 프레임에 멀쩡한 경기가 잠긴다). ⚠ 이 판정은 안내일 뿐이고, 입축구보다 **훨씬 자주 경계를 놓친다**(사람들이 킥오프 직전에 예측한다) — 실제 차단은 정책이 한다.
- **`isMatchSettled(match)`** — 채점 가능한가(= `result !== null`). ⚠ **`nowMs`를 받지 않는 유일한 시각 계열 판정이다** — 결과의 유무는 시계가 아니라 DB가 정한다. `!isMatchOpen`으로 대신하지 말 것(킥오프만 지나고 결과가 아직 없는 경기가 통째로 섞인다).
- **`isMatchInProgress(match, nowMs)`** — 지금 뛰고 있다고 볼 수 있는가. ⚠ **상한(4시간)이 규약이다** — "킥오프 지남 + 결과 없음"으로만 두면 **이틀 전 경기가 "진행 중"** 으로 뜬다(실측). 지난 경기 창이 7일이라 최대 일주일간 거짓 표기이고, 그 모양은 동기화가 정상이라고 명시한 두 상태(연기 · 스코어를 못 읽은 종료)와 구분되지 않는다. 창 밖은 진행 중이 아니라 **결과 대기**다.
- **`isAwaitingResult(match, nowMs)`** — 킥오프는 지났는데 결과가 없고 진행 중 창도 벗어났다(연기 · 스코어 미반영). ⚠ **화면이 침묵하면 거짓말이 된다** — 과거 날짜에 스코어가 빈 카드가 `진행 중` 배지도 없이 그려져 "아직 시작 안 한 경기"로 읽혔다. ⚠ `!isMatchSettled`나 `!isMatchOpen`으로 대신하지 말 것 — 둘 다 취소된 경기를 함께 끌고 온다(`isPredictionResultsOpen`과 같은 이유). 목록 카드와 상세가 **같은 어휘**로 `결과 대기`를 말해야 해서 함수 하나가 소유한다.
- **`groupMatchesByDay(matches, nowMs)`** — 목록을 **KST 달력 하루**로 묶는다(`{ key, label, matches }[]`). 카드마다 되풀이되던 날짜를 헤딩 하나로 접기 위한 것이고, 카드는 시각만 그린다. ⚠ **라운드(matchday)로 묶지 말 것** — 라운드는 킥오프 순서와 어긋날 수 있어(연기·재배치) 한 라운드가 여러 토막으로 갈린다. 날짜는 목록이 이미 킥오프 정렬이라 **연속 구간을 접기만 하면 된다.** ⚠ 여기서 다시 정렬하지 않는다(정렬은 `buildMatchListQueries`가 소유한다 — 두 구역의 방향이 다르다).
- ⚠ **`result`를 클라이언트가 다시 계산하지 않는다.** 스코어에서 파생된 컬럼이고 **무효 경기에서 null이 되는 규칙까지** DB가 단독으로 소유한다 → `result is not null`이 "채점 가능"의 유일한 술어다.
- ⚠ **select 문자열을 `+`로 잇지 말 것.** supabase-js가 **리터럴 타입**을 파싱해 결과 형태를 만드는데, 조각을 이어 붙이면 `string`으로 넓어져 추론이 통째로 `GenericStringError`가 된다(실측).
- ⚠ `MATCH_SELECT`는 **`team!home_team` 형태**다. `match → team` 경로가 둘이라 그냥 `team(...)`은 PGRST201이고, 컬럼명만 쓴 `home:home_team(...)`은 런타임엔 통하지만 **생성 타입이 모호성을 풀지 못한다**(`BLOCKED_SELECT`와 같은 함정 — 실측).
- 서버에서는 배럴 대신 `model/types`·`api/mappers`·`api/keys`·`api/list-query`를 직접 import.

## `@/features/predict-match`
- `MatchPrediction` — `PredictionBlock`에 세션·마감·뮤테이션을 붙인 컴포넌트. 조회는 `@/entities/match`다(`cast-survey-vote`와 같은 분업).
- ⚠ 세션 `status`를 **3분기**한다(`loading`을 비로그인과 같이 다루면 콜드 로드 직후 로그인 사용자가 안내를 본다).
- ⚠ **비로그인에게도 선택지를 연결한다** — 눌러야 로그인 안내가 뜬다. 안내(`SignInDialog`)는 **뷰가 소유한다**(`onSignInRequired`로 올린다).
- ⚠ **집계 캐시를 건드리지 않는다 — 투표·입축구와 갈리는 지점이다.** 저쪽은 참여하는 순간 결과가 열려 낙관적으로 막대를 밀어야 하지만, 여기는 **마감 시점과 공개 시점이 같은 킥오프**라 예측할 수 있는 동안 분포가 반드시 닫혀 있다 — 밀 막대가 애초에 없다. 같은 이유로 적중률 캐시도 건드리지 않는다(채점은 킥오프 뒤다).
- ⚠ RPC도 upsert도 쓰지 않는다 — 사유는 `cast-poll-vote`와 같다(upsert는 `match_id` UPDATE 권한을 요구해 "취소 불가"를 뚫는다).

## `@/entities/notice`
- `useNoticeListQuery(initialData)` / `useNoticeQuery(id, initialData)` / `useBannerNoticeQuery(initialData)` / `useAdminNoticeListQuery(deleted)` / `useAdminNoticeQuery(id)` / `noticeKeys` / `Notice` · `NoticeListItem` · `NoticeType` / `NOTICE_TYPES` / `noticeVisibility(notice, nowMs)`.
- **`buildNoticeListQuery(supabase)` / `buildBannerNoticeQuery(supabase)`** — 목록·배너 조립의 단일 소스(`api/list-query.ts` — 서버 안전). 훅과 SSR 페이지가 **같은 함수**를 부른다(`buildPostListQuery`와 같은 규약).
  - ⚠ 목록 정렬은 **필독 먼저, 그다음 최신순**이다. `notice_type` enum의 정의 순서(`'필독','공지'`)가 곧 오름차순이라 값을 더하거나 순서를 바꾸면 이 정렬이 함께 움직인다.
  - ⚠ 배너는 `'필독'`만 본다 — 화면 최상단의 가장 비싼 자리라 "반드시 읽어야 하는 것"만 올린다.
- ⚠ **목록·배너 select에는 `body`가 없다**(`NOTICE_LIST_SELECT` ↔ `NOTICE_SELECT`). 본문이 20,000자까지 갈 수 있어 목록 50건이면 응답이 그대로 부푼다 — `POST_LIST_SELECT` ↔ `POST_DETAIL_SELECT`와 같은 판단이다.
- ⚠ **예약·만료·삭제를 훅이 거르지 않는다.** `notice_select_live` 정책이 단독으로 갖는다 — 필터를 조회마다 반복하면 한 곳만 빠뜨려도 발표 전 공지가 샌다(소프트 삭제·차단과 같은 자리).
- ⚠ 어드민 조회만 테이블이 아니라 `admin_notice_list` RPC를 부른다 — 정책이 감춘 행을 봐야 하기 때문이다.
- ⚠ `useBannerNoticeQuery`의 `initialData`는 **`null`과 `undefined`가 다른 뜻이다** — `null`은 "필독 공지가 없다"(조회 끝), `undefined`는 "프리페치 안 함"이다. 하나로 접으면 공지가 없는 사이트에서 목록을 열 때마다 조회가 한 번 더 나간다.
- ⚠ `noticeVisibility`는 **`nowMs`를 인자로 받는다**(`isSurveyOpen`·`isMatchOpen`과 같은 형태·같은 이유). `null`은 "아직 판정 전"이고 `"closed"`로 접으면 첫 프레임에 멀쩡한 공지가 끝난 것으로 보인다.
- ⚠ 키에 `userScope`를 붙이지 않는다(공지에는 "나"에 종속된 값이 없다). 대신 어드민 목록을 `admin` 조각으로 갈라 로그아웃 뒤 남은 캐시가 일반 목록으로 새지 않게 한다.

## 어드민 백오피스 (`@/features/admin-*`)
- `admin-match` — `MatchForm` · `useUpdateMatch`/`useUnlockMatch`/`useDeleteMatch`/`useRestoreMatch`/`useSyncMatches`.
- `admin-survey` — `SurveyForm` · `useCreateSurvey`/`useUpdateSurvey`/`useSetSurveyOptions`/`useEditSurveyOption`/`useDeleteSurvey`/`useRestoreSurvey` · `useSurveyImageUpload`/`useSurveyImageCleanup`.
- `admin-post` — `extractImageUrls` · `useStripPostImages`/`useMaskPost`/`useUnmaskPost`/`useAdminDeletePost`/`useAdminRestorePost`/`useEditPostPoll`.
- `admin-notice` — `NoticeForm` · `useCreateNotice`/`useUpdateNotice`/`useDeleteNotice`/`useRestoreNotice`.
- ⚠ **jsonb 인자를 만드는 직렬화 함수를 features가 단독으로 소유한다.** 생성 타입이 `Json`이라 키 오타(`bgColor` vs `bg_color`)를 컴파일러가 잡아주지 못한다 — `database.types.ts`의 보증이 여기서만 사라지는 자리다.
- ⚠ **버려진 배경 파일은 "빼기"가 아니라 저장이 지운다**(`useSurveyImageCleanup`). 버튼을 누른 순간 지우면 저장하지 않고 떠났을 때 **경로는 남고 파일이 없는** 면이 되어 카드가 통째로 투명해진다 → DB가 그 경로를 실제로 버린 뒤에 정리한다.
- ⚠ **중복 실행 가드가 features에 없다.** 성공의 부수효과(이동 목적지·문구)가 화면의 결정이라 뮤테이션을 조립하는 뷰의 `model/`이 갖는다. 목록의 항목별 삭제·복구는 `useDuplicateGuard`가 아니라 **Set + `mutateAsync().finally()`** 형태다(`useBlockRemoval` 선례).

## `@/entities/block`
- `useBlockedUsersQuery(userId)` / `blockKeys` / `BlockedUser` — 내가 차단한 사람 목록. (select 문자열과 매퍼는 슬라이스 내부다 — 배럴에 올리면 호출부가 0인 export가 되어 `check:conventions`가 막는다.)
- ⚠ **`entities/profile`에 얹지 않고 별도 슬라이스다.** 얹으면 그 슬라이스가 "프로필 + 차단" 두 도메인을 떠안는다(`entities/poll`을 `entities/post`에서 뗀 것과 같은 판단). entities끼리 import할 수 없는 것은 걸림돌이 아니다 — 행 타입은 각 슬라이스가 `@/types/database.types`에서 직접 뽑는 것이 이미 관례다.
- ⚠ 키를 **userId로 스코프**한다(`identityKeys`·`pollKeys`와 같은 이유). 차단 목록은 통째로 "나"에 종속된 값이라, 키에 유저가 없으면 계정 전환 시 이전 사용자의 목록이 노출된다.
- ⚠ `BLOCKED_SELECT`는 **`blocked:profiles!blocked_id(...)`** 형태다. `user_block → profiles` 경로가 둘이라 그냥 `profiles(...)`는 PGRST201이고, `blocked:blocked_id(...)`는 런타임엔 통하지만 **생성 타입의 추론이 모호성을 풀지 못한다**(캐스트로 덮으면 스키마 어긋남을 컴파일러가 못 잡는다). `post`가 컬럼명 형태로 되는 것은 그쪽 경로가 하나뿐이라서다.

## `@/features/block-user`
- `useBlockUser()` / `useUnblockUser()` — 차단·해제. 조회는 `@/entities/block`이다(`entities/post` ↔ `features/toggle-post-like`와 같은 분업).
- ⚠ **숨김은 이 훅들이 하지 않는다.** `post_select_visible`·`comment_select_visible` 정책이 한다 — 여기가 하는 일은 행 하나를 만들거나 지우고 **가시성이 달라진 캐시를 되돌리는 것**뿐이다.
- ⚠ **중복 실행 가드가 여기 없다.** 성공의 부수효과(이동 목적지·스크롤 저장분 폐기·문구)가 화면의 결정이라 뮤테이션을 조립하는 쪽이 갖는다 — 차단은 `views/post-detail`의 `use-post-block`, 해제는 `views/profile`의 `use-block-removal`(항목별 Set 가드).
- ⚠ 무효화 Promise를 **차단은 반환하지 않고 해제는 반환한다.** 차단은 성공 직후 목록으로 떠나므로(리페치를 기다리면 "글을 찾을 수 없어요"가 깜빡인다), 해제는 화면에 머무르므로. 표는 `data-and-state.md`.
- ⚠ 이미 차단한 사람을 다시 차단하면 **23505를 성공으로 흡수한다**(멱등). 신고는 반대다 — 사유를 설명해야 한다(`api-and-db.md`의 "설명과 흡수" 표).

## `@/features/report-post`
- `ReportReasonList` — 글 상세 오버플로 시트의 **children으로 꽂는** 사유 목록. 사유 상수·훅은 내부 구현이라 노출하지 않는다(`cast-poll-vote`가 `PollVote` 하나만 내보내는 것과 같은 형태).
- ⚠ **오버레이를 스스로 만들지 않는다.** 시트 위에 시트를 겹치면 `useFocusTrap`이 이중이 되어 Escape·Tab 가둠이 둘이 되고 `aria-modal` 노드도 둘이 된다. "삭제하기 → Dialog"가 되는 건 먼저 닫고 나서 열기 때문이다(`inert={closing}`이 140ms 겹침을 덮는다) — 시트→시트는 그 사이 두 장이 교차한다. → 호출부가 `sheet: "none" | "menu" | "report"` 한 상태로 **children만 바꾼다.**
- ⚠ 사유 항목에 `danger`를 쓰지 않는다 — 다섯 개를 전부 붉게 칠하면 "한 뷰포트당 컬러 이벤트 1개"가 깨진다. 파괴성은 목록을 여는 `신고하기` 항목이 이미 표시했다.
- ⚠ 신고 뮤테이션은 **`.select()`를 붙이지 않는다** — `post_report`에 SELECT 권한이 없어 붙이면 42501이다.

## `@/entities/profile`
- `useProfileQuery(userId)` / `profileKeys` / `PROFILE_SELECT` / `buildProfile` — 닉네임·아바타 조회.
- `MyProfile` / `ProfileRow` — 도메인 타입 / DB 행 타입. `MyProfile.avatarPath`는 **경로**다(전체 URL이 아니다).
- ⚠ **`userId`를 인자로 받는다.** 세션을 직접 읽지 않는 이유는 `entities`끼리 서로 import할 수 없기 때문이다 — 세션을 아는 **상위 레이어**(`views/profile`이 선례)가 `user?.id`를 넘긴다.
- ⚠ **`avatarUrl`은 여기 없다 → `@/shared/config`.** 아바타를 쓰는 곳이 `entities/comment`·`entities/post`(상세)·`views/profile` 셋인데 entities끼리는 import할 수 없다(`OAUTH_PROVIDERS`와 같은 사정).
- 서버에서는 배럴 대신 `model/types`·`api/keys`·`api/mappers`를 직접 import(`post`·`comment`와 같은 형태).

## `@/shared/config`
- `ROUTES` — 경로 헬퍼. **경로 문자열 하드코딩 금지**(`"/posts"` ❌ → `ROUTES.postList`).
  ⚠ 승부예측은 `/predictions`가 아니라 **`/matches`** 다 — 나중에 선수 평점·매치 스레드가 붙으면 전부 경기를 부모로 삼는데, 그때 `/predictions/[id]`는 거짓말이 된다. 탭 라벨은 "승부예측"이고 **표시 문구와 경로는 다른 계약**이다.
- **`isTabBarRoute(pathname)` / `activeTabHref(pathname)`** — 하단 탭바를 그리는 화면인지와 그때 활성인 탭. **정확 일치 배열로 되돌리지 말 것** — 말머리 목록(`/posts/category/…`)이 생기면서 값이 유한하지 않게 됐고, 빠뜨리면 그 화면에서 **탭바가 사라지고 토스트가 탭바 자리로 내려간다.** 탭바(`widgets`)와 토스트(`shared/ui`)가 이 둘만 본다.
- `signInWithNext(pathname)` / `withNext(path, next)` — 복귀 경로를 붙인 URL. 이 형태를 만드는 곳이 가드·`SignInDialog`·`AuthStatus`로 여럿이라 여기로 모았다. ⚠ 액션 컨트롤에서 이걸로 **직접 이동하지 않는다** — `SignInDialog`가 안내를 끼고 그 안에서 부른다(예외는 라벨이 "로그인"인 컨트롤).
- **`safeNextPath(next, origin)`** — `?next=` 값을 앱 내부 경로로만 통과시킨다. **직접 문자열 검사를 짜지 말 것** — `startsWith("/") && !startsWith("//")`로는 `/\evil.com`도 `/..//evil.com`도 못 막는다(둘 다 실제로 뚫렸다).
- `COLOR` — JS 인라인 style용 색 상수. **토큰 hex 하드코딩 금지**. 클래스로 확정할 수 없는 자리(런타임 색과의 비교·인라인 세그먼트 색)에서 쓴다 — 현역 선례는 `shared/ui/ratio-bar.tsx`·`entities/survey/ui/split-card.tsx`.
- **`OAUTH_PROVIDERS` / `OAUTH_PROVIDER_LABEL`** — 지원 소셜 프로바이더의 단일 소스. `supabase/config.toml`의 `[auth.external.*]`와 갈리면 안 된다. ⚠ `shared`에 있는 이유는 로그인(`features/sign-in`)과 계정 연결(`features/link-identity`)이 같은 목록을 써야 하는데 features끼리는 import할 수 없어서다.
- **`avatarUrl(path)` / `AVATAR_BUCKET`** — 아바타 **경로** → 공개 URL. ⚠ DB에는 전체 URL이 아니라 경로만 저장한다(호스트가 환경마다 다르다: 로컬 `127.0.0.1:64321` ↔ 원격 `*.supabase.co`). 조립은 이 함수 한 곳에서만. `shared`에 있는 이유는 `OAUTH_PROVIDERS`와 같다 — entities 셋이 함께 쓴다. 버킷명 문자열도 여기서 가져다 쓴다(`features/update-profile`이 선례).
- **`publicStorageUrl(bucket, path)`** — 공개 버킷 경로 → URL 조립의 **단일 소스**. 새 공개 버킷이 생기면 여기에 붙인다(버킷별 함수는 이 함수를 감싸기만 한다).
- **`surveyImageUrl(path)` / `SURVEY_IMAGE_BUCKET`** — 입축구 면 배경 경로 → URL. ⚠ 버킷명 상수는 한때 배럴에 없었다(TS 호출부가 0이었다) — 어드민의 배경 업로드가 생기면서 올렸다(`AVATAR_BUCKET`·`POST_IMAGE_BUCKET`과 같은 이유). ⚠ 이 버킷의 쓰기는 **관리자에게만 열려 있다**(`survey_images_*_admin` 정책) — 어드민 화면의 배경 업로드가 그 경로이고, `scripts/upload-survey-images.mjs`(service_role) 경로도 그대로 살아 있다.
- **`postImageUrl(path)` / `POST_IMAGE_BUCKET`** — 본문 이미지 경로 → 공개 URL.
  ⚠ **아바타와 달리 결과(전체 URL)가 그대로 `post.content`에 들어간다.** 본문은 사용자가 외부 주소도 적을 수 있는 자유 텍스트라 경로 규약을 강제할 자리가 없다 — 사유는 `api-and-db.md`의 "본문 이미지는 URL을 본문에 담는다" 절에 있다.
  ⚠ 조립 자체는 `publicStorageUrl`이 한다. **이 함수만 결과(전체 URL)가 DB에 들어간다** — 본문은 자유 텍스트라 경로 규약을 강제할 자리가 없다.
- **`env`** — `NEXT_PUBLIC_*` 환경변수의 단일 소스(`supabaseUrl`·`supabaseAnonKey`·`siteUrl`·`showPlayerPhotos`). **`process.env`를 호출부에서 다시 읽지 말 것** — `proxy.ts`가 화면·훅과 같은 supabase 인스턴스를 봐야 세션 쿠키가 어긋나지 않는다.
  - `siteUrl`은 `og:image`를 절대 URL로 만드는 `metadataBase`(루트 layout)용이다. `NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` → `localhost:3000` 순으로 폴백한다.
- **`isSupabaseConfigured()`** — env가 채워졌는지. 값이 비어도 빌드는 성공해야 하므로 `env`는 throw하지 않는다 → **가드는 호출부의 책임**이고, 그 가드를 각자 짜지 말고 이걸 쓴다(`proxy.ts`가 선례).

## `@/shared/ui`
**현역(게시판 v2가 실제로 쓰는 것)** — 새로 만들기 전 여기부터 확인:
`Button`·`buttonClassName`·`Icon`·`Skeleton`·`EmptyState`·`Markdown`·
`Chip`·`chipClassName`·`ActionChip`·`actionChipClassName`·`Dialog`·`SignInDialog`·`Sheet`·`ToastViewport`·`Pill`·`Avatar`·`Wordmark`·`TextField`·`RatioBar`·`StaleBanner`

**현재 미사용** — **"검증된 현역"으로 오인하지 말 것**:
`TabHeader`·`Flag`·`Shirt`·`SectionHead`·`LiveDot`·`LiveStatusPill`·`NightCard`·`PlayerSilhouette`
(전부 `docs/legacy/v1-inventory.md`가 보존 대상으로 명시한 v1 자산이다.)

⚠ 위 v1 자산은 **실측상 번들에 실리지 않는다**(위 미사용 목록 전량이 프로덕션 청크에서 0건). 다만 그건 각 모듈이 순수해서이지 "배럴이라 공짜"여서가 아니다 — 서드파티 의존을 끌고 오는 무거운 모듈은 `sideEffects` 선언이 없으면 그대로 실린다(`architecture.md`의 트리셰이킹 절).

> ⚠ 이 두 목록은 **실사용 여부로만 판정한다** — 손으로 세지 말고 **`pnpm check:conventions`** 를 돌린다(호출부 0인 export를 전수로 뽑아 준다).
> **이 문서의 존재 이유가 "새로 만들기 전 확인"이라 목록이 틀리면 문서가 없느니만 못하다.** UI를 추가·제거하면 여기부터 고친다.

- `Markdown` — 마크다운 렌더(GFM). `"use client"` **없음** — 서버 렌더 가능.
- `Chip` — 말머리 칩. **`rounded-sm`(6px)** 이다 — 칩이라고 알약이 아니다(`styling.md` 예외 목록 참고).
- `chipClassName(selected)` — 위 칩의 클래스만. 목록의 말머리 레일은 **이동**이라 `<Link>`에 이 클래스를 입히고(`Link` 안에 `button`을 넣지 않는다), 작성 폼은 **선택**이라 `Chip`(`button`)을 그대로 쓴다. 분리 사유는 `Button`↔`buttonClassName`과 같다.
- `ActionChip` / `actionChipClassName` — 좋아요·댓글 카운터 칩. 클래스 함수가 분리된 이유는 `Button`↔`buttonClassName`과 같다 — **버튼이 아닌 요소로 같은 칩을 그려야 하는 자리**가 있어 클래스만 필요하다(세션 복원 중의 좋아요는 누를 수 없어 `span`이다).
- `Dialog` / `Sheet`(+`SheetItem`) — 확인 대화상자 / 하단 시트. 포커스 가둠은 `@/shared/lib`의 `useFocusTrap`.
  - `Sheet`는 화면 하단에 붙는 **edge-to-edge** 시트다(`styling.md`). "닫기" 행을 두지 않는다.
  - ⚠ 닫기 수단은 스크림 탭 · Escape · 스와이프인데 **셋 다 포인터이거나 물리 키보드다.** 그래서 그래버가 `button aria-label="닫기"`를 겸한다 — 오버플로 메뉴는 남의 글이면 항목이 전부 `disabled`라 **시트 안 활성 컨트롤이 0개**가 되고, 그때 스크린리더·키보드의 유일한 탈출구가 이 버튼이다. `div`로 되돌리지 말 것.
  - ⚠ 진입·퇴장 애니메이션은 **바깥 요소**, 드래그 오프셋은 **안쪽 래퍼**가 갖는다. 한 요소에 겹치면 CSS animation이 캐스케이드에서 inline style을 이겨 드래그가 통째로 무시된다. 새 오버레이에 드래그를 붙일 때 같은 함정을 밟지 말 것.
- **`SignInDialog`** — "로그인이 필요해요" 안내. **로그인이 필요한 액션을 비로그인이 눌렀을 때 `router.push(signInWithNext(...))`로 곧바로 화면을 갈아치우지 않는다** — 무엇 때문에 화면을 잃는지 모른 채 이동하게 되고, 되돌아올 길도 없다. 문구는 `action`(`"좋아요를 누르려면"`처럼 **`~하려면`으로 끝나는 구절**) 하나만 받고 나머지 문장은 컴포넌트가 갖는다.
  - ⚠ **예외는 대놓고 "로그인"이라고 쓰인 컨트롤이다** — `AuthStatus`·`CommentBar`의 로그인 버튼은 목적지가 라벨에 적혀 있어 한 단계 더 묻는 것이 방해다. 그대로 `signInWithNext`로 보낸다.
  - ⚠ **화면을 떠나는 동작에는 `next`를 준다**(글쓰기 → `/posts/new`, 프로필 탭 → `/profile`). 기본값(지금 화면)으로 두면 로그인하고 돌아와서 그 동작을 처음부터 다시 눌러야 한다.
  - ⚠ **열림 상태는 호출부가 갖고, 렌더 자리는 스크롤 영역 밖이다.** `Dialog`가 `absolute`라 스크롤 컨테이너 안에 두면 스크롤한 만큼 화면 밖에 뜨고, 목록에서는 항목 수만큼 생긴다 → 액션 컴포넌트(`LikeButton`·`PollVote`·`SurveyVote`)는 `onSignInRequired` 콜백만 올리고 **뷰가 한 벌** 렌더한다. 한 화면의 여러 액션은 **문구만 다른 한 벌**을 공유한다(글 상세가 그 형태다 — `signInAction: string | null` 하나로 무엇이 막혔는지를 담는다).
  - ⚠ **앵커는 앵커로 남긴다.** 크롤 가능한 링크(`/posts/new` FAB·프로필 탭)는 `<Link>`를 유지하고 `onClick`에서 비로그인일 때만 `preventDefault`한다 — 그 앵커가 크롤러의 유일한 발견 경로이고 `robots.txt`가 아무것도 막지 않는 근거다(`nextjs.md`).
  - ⚠ 세션 `status`는 **3분기**한다 — `loading`에 가로채면 복원 중인 로그인 사용자가 안내를 본다.
- `StaleBanner` — 리페치 실패를 **데이터를 유지한 채** 알리는 배너. ⚠ 호출부의 조건은 반드시 `error && data`다 — `error`를 데이터 렌더보다 먼저 보면 좋아요 한 번에 네트워크가 끊겨도 읽고 있던 목록이 통째로 사라진다(`data-and-state.md`). 목적격 조사(을/를)는 컴포넌트가 받침으로 판정하므로 **명사만** 넘긴다.
- `ToastViewport` — 루트(`AppProviders`)에 **하나만** 둔다. 발행 API(`useToast`)는 `@/shared/lib`에 있다.
  - ⚠ **앱의 유일한 라이브 리전이다.** 문구가 없어도 언마운트하지 않는다(리전과 내용이 함께 마운트되면 발화가 불안정하다) — `if (!message) return null`로 되돌리지 말 것. 화면마다 `role="status"`를 새로 만들지 않는 이유는 `code-quality.md`에.
- ⚠ `Link` 안에 `Button`을 넣지 않는다(`<a>` 안의 `<button>`). 버튼형 링크는 `buttonClassName({...})`을 `Link`의 className에 준다.

## `@/widgets`
- `AppBar` — 목록 화면 상단(워드마크 + `leading` 슬롯).
- `BottomTabBar` — 하단 탭바. **`backdrop-blur`가 허용된 유일한 요소**다(`styling.md`).
  - ⚠ **로그인해야 열리는 탭을 추가하면 `signInAction` 문구를 함께 적는다.** 그 값이 있는 탭만 비로그인의 이동을 가로채 `SignInDialog`를 띄운다 — 앵커는 그대로 두고 `preventDefault`만 한다. 빠뜨리면 그 탭은 안내 없이 이동했다가 `AuthRequired`에 막혀 로그인 화면으로 떨궈진다.
  - ⚠ 그 다이얼로그는 `<nav>`의 **형제**여야 한다. 탭바가 `absolute`라 자기 안의 `Dialog`에게 컨테이닝 블록이 되어, 안에 두면 알약 한가운데에 뜬다.
- `SubHeader` — 상세·작성·수정 화면 상단(뒤로가기 + 공유).
- `TabScrollArea` — 목록 스크롤 영역(`<main>` 제공 + 스크롤 복원).
- `AuthShell` — 인증 화면의 공통 껍데기.
- **`NoticeBanner`** — 피드 최상단의 한 줄 공지 배너(최신 **필독** 하나). 없으면 **아무것도 그리지 않는다** — 빈 띠가 첫 화면의 가장 값진 세로 공간을 먹지 않게. ⚠ 조회 실패도 조용히 넘긴다(화면의 본문이 아니라 덧붙는 안내라, 에러 박스를 얹으면 정작 읽으러 온 목록 위에 뜬다). ⚠ 자리는 **말머리 레일 위**다 — 아래로 내리면 공지가 그 말머리에 속한 것으로 읽힌다.
  ⚠ **공지로 가는 진입점은 이 배너 하나다** — 앱바·탭바·프로필에 더하지 않는다. 대가는 **필독 공지가 없는 동안 `/notices`와 `'공지'` 타입 글의 도달 경로가 0이 되는 것**이고(사이트맵에는 남아 크롤러만 본다), 그것까지 포함해 수용한 상태다. 이 배너나 상세의 "목록" 버튼을 없애려면 **대체 진입점을 먼저 만든다.**
- `AuthStatus` — **비로그인일 때의 로그인 링크**만 그린다(로그인 상태에서는 `null`). ⚠ 라벨이 "로그인"이라 `SignInDialog`를 거치지 않고 곧바로 이동한다 — 목적지가 라벨에 적혀 있어 한 단계 더 묻는 것이 방해다(`CommentBar`의 로그인 버튼도 같다).
  ⚠ 계정 관련 동작(닉네임 표시·로그아웃)을 여기 되넣지 않는다 — 프로필 화면과 두 곳으로 갈린다. 프로필 진입은 하단 탭바가 상시 제공하고, **로그아웃은 `views/profile`이 단독으로 갖는다.**
