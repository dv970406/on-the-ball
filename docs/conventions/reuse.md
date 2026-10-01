# 재사용 헬퍼 (중복 구현 금지 · DRY)

새 유틸·계산·포맷을 만들기 전에 **여기 있는 것부터 확인**한다. 같은 로직을 여러 곳에 복붙하지 않는다. 공통 로직이 필요하면 아래 위치에 추가하고 배럴로 노출한다.

## `@/shared/lib/format` (순수 함수 — 서버·클라 공용)
- `formatCount` — 숫자 → `"28,412"`
- `formatRelativeTime(iso, nowMs)` — 과거 시각 → `"방금 전"`/`"3분 전"`/`"2시간 전"`/`"5일 전"`, 7일↑은 `"7월 30일"`, **해가 다르면 `"2025년 7월 30일"`**.
  - 연도를 붙이는 이유: 전에는 무조건 `"7월 30일"`이라 **작년 항목이 올해 항목과 구분되지 않았다**(`<time dateTime>`은 정확한데 화면 텍스트만 거짓말).
  - ⚠ **`nowMs`를 인자로 받는다**(`pickRecentRumors`와 같은 형태·같은 이유). 렌더 중에 시계를 읽으면 서버 렌더와 하이드레이션이 다른 값을 만든다 — 이적 보드·상세가 SSR이라 실제로 깨진다. 호출부는 `useNowMs()`를 그대로 넘긴다.
  - ⚠ **SSR 화면에서는 서버 시각을 흘려보낸다** — `serverNowMs ?? useNowMs()`. 안 그러면 첫 렌더가 절대시각이었다가 바뀌며 **시프트**한다(실측). ⚠ **순서를 뒤집지 말 것** — `useNowMs()`는 세션당 한 번 고정되어 낡은 값이 갓 받은 서버 시각을 이긴다(`data-and-state.md`).
  - ⚠ **`nowMs`가 `null`이면 절대시각을 돌려준다**(연도 포함). 기준 시각 없이 상대시각을 추측하면 그 순간이 불일치다. 연도를 빼는 쪽이 거짓이 될 수 있어, 모를 때는 붙이는 쪽으로 기운다.
  - ⚠ **미래 시각에 쓰지 않는다** — `nowMs - date`로 과거를 전제해서 **미래 시각이 전부 "방금 전"** 이 된다. 미래 시각(마감·일정)은 절대 날짜나 카운트다운으로 그린다.
  - ⚠ **공유·색인되는 페이지의 본문 날짜를 "오늘"·"내일" 같은 상대 표기로 굳히지 않는다** — 크롤 시점에 굳어 거짓이 된다. 문서로 읽히는 날짜는 연도까지 붙인 절대 날짜로 쓴다.

## `@/shared/lib` (배럴 — 클라이언트 훅 포함)
- `cn` — Tailwind 클래스 병합
- **`parsePostId`** — URL의 `[id]` → 정수 id. 이름은 첫 호출자를 기록할 뿐이고 **모든 동적 `[id]` 라우트가 이것을 쓴다**(`app/transfers/[id]/page.tsx`). **새로 정규식을 만들지 말 것** — 같은 id를 해석하는 곳이 여럿이라 파서가 갈리면 `/transfers/2`·`/transfers/002`·`/transfers/2.0`이 같은 리소스의 별칭 URL이 된다(전에 `\d+` vs `Number()`로 갈려 서버 가드가 뚫린 적도 있다). 서버에서는 `@/shared/lib/post-id` 직접 경로로.
- **`hasVisibleChar`** — 보이는 글자가 하나라도 있는지. **`.trim()` 대신 이걸 쓴다** — `.trim()`도 Postgres `[:space:]`도 제로폭 문자·BOM을 못 걸러서 "제목이 완전히 비어 보이는 행"이 실제로 만들어졌다. DB의 `public.has_visible_char`와 **문자 집합이 같아야 한다**(한쪽만 고치지 말 것).
- **`normalizeNickname`** — **보이는 텍스트의 정규형**(보이지 않는 문자 제거 · NBSP·전각공백을 보통 공백으로 · 연속 공백 접기 · **NFC**). 이름은 첫 호출자를 기록할 뿐이고 닉네임 전용이 아니다 — **화면에서 구분되어야 하는 값**은 이걸로 접는다. 접지 않으면 `.trim()`을 통과한 '찬성'·'찬성 '·'찬'+제로폭공백+'성'이 서로 다른 값으로 저장되어 똑같이 생긴 항목이 여럿 뜬다. **DB의 `public.normalize_nickname`과 같은 결과를 내야 한다** — 두 문자 집합(`INVISIBLE`/`BLANK`)의 합집합이 `hasVisibleChar`의 클래스와 같아야 한다는 제약까지 한 쌍이다(한쪽만 고치지 말 것).
  ⚠ **닉네임 길이는 원본이 아니라 정규형으로 잰다.** DB 트리거가 쓰기 직전에 정규화하므로 원본으로 재면 화면과 저장값이 갈린다 — 꼬리 공백·제로폭이 정규형에서 사라지기 때문이다.
  ⚠ **마지막 단계가 NFC다.** 없으면 `isPlainNickname`이 자모 분해형 한글(U+1112 U+1161 U+11AB = '한')을 거부하는데, 그 형태는 macOS에서 복사한 한글로 실제로 들어온다. ⚠ **NFKC로 바꾸지 말 것** — 전각 `Ａ`가 `A`로 접혀 `isPlainNickname`이 막으려는 동형이의 입력이 통과한다.
- **`isPlainNickname`** — 닉네임 허용 문자(한글 음절 · 한글 자모 · 영문 · 숫자). **공백도 허용하지 않는다.** DB의 `public.is_plain_nickname`(`profiles_nickname_plain` CHECK)과 **글자 하나까지 같아야 한다** — 갈리면 클라가 통과시킨 값이 23514가 되어 사용자는 한국어 안내 대신 "입력값이 허용 범위를 벗어났어요."를 본다.
  - ⚠ **정규형에 적용한다**(`normalizeNickname`의 결과). 원본으로 판정하면 NFD 한글이 거부되고 꼬리 공백까지 에러가 된다.
  - ⚠ **정규식을 호출부에 다시 적지 말 것**(`parsePostId`·`safeNextPath`와 같은 이유). 자모 범위 상한이 `ㅣ`(U+3163)인 것도 규약이다 — 다음 문자 U+3164는 HANGUL FILLER로 화면에 아무것도 그리지 않아, 한 글자만 넓혀도 "보이지 않는 닉네임"이 돌아온다.
  - 부수 효과로 **동형이의 사칭이 막힌다** — 키릴 `а`·전각 `Ａ`는 정규형을 통과하지만 라틴 글자와 화면에서 구분되지 않았다.
- **`clamp(text, max)`** — 코드포인트 단위 말줄임(넘치면 끝에 `…`). **`.slice()`로 직접 자르지 말 것** — UTF-16 코드유닛이라 이모지가 반쪽으로 잘린다. `generateMetadata`의 `<title>`·description 길이 방어가 이 함수를 쓴다. 서버에서는 `@/shared/lib/text` 직접 경로로.
- **`TextLimit` / `lengthOverflow`** — 길이 한도 **한 쌍**(그래핌=화면 · 코드포인트=DB 정합)과 그 판정. **길이 제한은 이걸로만 건다.**
  - ⚠ **그래핌 길이만 재서 비교하지 말 것.** 1그래핌의 코드포인트 수에 상한이 없어(`a`+결합악센트 50개 = 그래핌 1 / 코드포인트 51) 그래핌 한도가 DB `char_length` 한도를 함의하지 못한다. 코드포인트 검사를 빠뜨려도 **컴파일·린트·rls 검사 어느 것도 안 잡아주고**, 그 순간 사용자는 한국어 안내 대신 DB의 23514(또는 btree 인덱스의 영어 에러)를 본다. `parsePostId`·`safeNextPath`와 같은 이유로 규약을 함수 하나가 소유한다.
  - 길이 측정 함수(`codePointLength`·`graphemeLength`)는 `text.ts` 안에 있고 **배럴에 올리지 않았다** — 호출부가 직접 재면 위 함정으로 돌아가기 때문이다. `<input maxLength>`·`.length`도 길이 제한에 쓰지 않는다(UTF-16 코드유닛이라 이모지가 2로 세어진다).
  - 짝이 되는 상수는 features가 갖는다 — `NICKNAME_LIMIT`(`update-profile`). 값 표와 K=10 근거는 `api-and-db.md`.
- **`userScope(userId)`** — 쿼리 키의 사용자 스코프 조각(`undefined` → `"guest"`). ⚠ `"guest"` 리터럴을 호출부가 각자 적지 말 것 — 갈리면 **캐시 키가 조용히 어긋나** 빌드도 린트도 못 잡고 화면만 스켈레톤이 되거나 남의 데이터가 남는다. `transferKeys`가 쓴다. ⚠ `userId: string`인 키(`identityKeys`·`profileKeys`)에는 쓰지 않는다. `api/keys.ts`는 서버 소비자라 **직접 경로**로 가져온다.
- **`useNextParam`** — 현재 URL의 `?next=`. `useSearchParams` 대신 쓴다(그걸 쓰면 화면 프리렌더가 CSR로 떨어진다).
  - ⚠ **읽은 값을 렌더에 쓰는 화면**용이다(로그인 화면의 `redirectTo` 조립). 값이 필요한 시점이 **effect 안뿐**이라면 이걸 쓰지 말고 거기서 직접 읽는다 — 이 훅은 `useSyncExternalStore`로 렌더 중에 읽으므로 렌더타임 의존이 새로 생긴다. 라우트 가드(`use-auth-redirect`)가 그 경우이고, 사유는 그 훅 주석에 있다.
- **`useDuplicateGuard(mutation)`** — 렌더를 기다리지 않는 중복 실행 가드. `{ isLocked, lock }`을 돌려준다. **`ref` + 해제 effect를 직접 짜지 말 것** — `disabled={isPending}`가 왜 부족한지(같은 tick의 두 번째 클릭)가 이 훅의 주석에 모여 있다. 소비자는 `useOAuthSignIn`·`useLinkIdentity`·`useUnlinkIdentity`·댓글 입력칸(`views/transfer-detail/model/use-comment-composer`)이다.
  - ⚠ **`isPending`(boolean)이 아니라 뮤테이션을 통째로 넘긴다.** 해제가 `status`+`submittedAt`에 걸려 있어서다 — boolean은 "아직 시작 전"과 "이미 끝남"을 구분하지 못해, 마이크로태스크만으로 끝나는 실패(동기 `throw`)에서 deps가 `false → false`가 되어 **자물쇠가 영영 풀리지 않았다.**
  - ⚠ **`isPending`을 prop으로 받는 컴포넌트에 두지 말 것.** 부모가 리렌더될 때까지 낡은 값을 읽으므로 같은 무증상 잠금이 된다 → 뮤테이션을 조립하는 쪽에 둔다.
  - ⚠ 확인과 잠금이 **나뉜 이유가 규약이다** — 사이에 끼는 검증이 실패하면 잠그지 않고 빠져나가야 한다. 잠그면 뮤테이션이 시작되지 않아 `isPending`이 돌지 않고, 그 자물쇠는 영영 풀리지 않는다.
  - ⚠ 목록의 **항목별** 가드는 이 훅으로 만들 수 없다 — 렌더 표시용 상태를 함께 가져야 해서 형태가 다르다(`data-and-state.md`).
- **`useNowMs`** — 클라이언트 시계. 마운트 전에는 `null`.
  - ⚠ **"현재 시각"이 아니다.** 값이 **모듈 스코프에 세션당 한 번** 고정되어(앱을 처음 연 화면에서 굳는다) SPA 세션 내내 그대로다 — `useSyncExternalStore` 계약상 스냅샷이 매번 달라지면 무한 렌더가 되기 때문이다(그 훅 주석).
  - ⚠ **그래서 서버 시각이 있으면 그쪽이 우선이다** — `serverNowMs ?? useNowMs()`. 순서를 뒤집으면 낡은 클라 시계가 갓 받은 서버 시각을 이겨 **마감된 것이 진행 중으로 보인다**(`data-and-state.md`에 실측).
  - ⚠ **서버 프리페치가 없는 화면**에서는 세션 고정 시계가 유일한 기준이 되어 **방금 만든 것이 과거 시계로 판정된다.** 그런 화면에서 시각 판정이 필요하면 TanStack Query의 `dataUpdatedAt`(그 데이터를 받은 순간)을 기준으로 쓴다 — 무효화가 곧 리페치라 판정이 함께 따라온다.
  렌더 중 `Date.now()`를 부르지 않기 위한 훅이다. **시간에 따라 달라지는 표시는 이걸로 판정한다** — `null`인 첫 렌더에서는 그 표시를 그리지 않으면 서버·클라 출력이 같아진다.
- **`useItemGuard<K>()`** — 목록의 **항목별** 중복 실행 가드(`run(id, task)` · `isBusy(id)`). 뮤테이션 하나를 여러 항목이 나눠 쓰는 자리(댓글 삭제)용이다. ⚠ `ref` + `state` + `.finally()`를 호출부마다 다시 짜지 말 것 — 사유는 그 파일 주석과 `data-and-state.md`. ⚠ "항목 수 자체가 불변조건"인 목록(로그인 수단 해제)에는 쓰지 않는다.
- **`serverToClientTime(serverMs)`** — 서버 시각을 **이 기기 시계** 기준으로 옮긴다(잰 오차의 최솟값을 쓴다 — 지연은 늘 양수라 최솟값이 참 오차에 가깝다). TanStack `initialDataUpdatedAt`처럼 기기 시계와 빼서 신선도를 재는 자리에 쓴다 — 서버 시각을 그대로 넣으면 기기 시계 오차만큼 방금 그린 SSR이 stale이 되거나 옛 페이로드가 신선해진다. ⚠ **화면에 그리는 값에는 쓰지 않는다** — 잰 오차가 기기마다 달라 서버 HTML과 갈린다. 신선도처럼 그려지지 않는 값에만 쓰고, 부르는 자리는 옵션 함수(`initialDataUpdatedAt: () => …` — Query가 만들어질 때 한 번)다.
- `useScrollRestore` — 목록 스크롤 위치 저장/복원
- `useFocusTrap` — 오버레이(`Dialog`·`Sheet`) 안에 포커스를 가둔다. ⚠ 초기 포커스는 **`preventScroll: true`** 로 준다 — 화면 밖에서 올라오는 시트에 그냥 `focus()`하면 브라우저가 `overflow-hidden`인 430px 프레임을 스크롤시켜 **되돌릴 수 없게** 화면이 밀린다(실측)
- `useToast` / `useToastStore` — 토스트 발행. **표시 영역(`ToastViewport`)은 `@/shared/ui`에 있고 루트에 하나만 둔다** — 상태와 UI가 레이어를 달리한다

> ⚠ **이 배럴에는 호출부가 0인 export를 두지 않는다.** 검증은 `pnpm check:conventions`가 한다(화이트리스트 없이 전수 판정).
> 순수 함수는 git 이력에서 그대로 복원되고, 배럴 export가 **재사용 목록을 오염시키는 비용**이 더 크다.
> 호출부가 사라진 헬퍼는 그 자리에서 지운다 — 되살릴 일이 생기면 이력에서 꺼내고 여기 다시 적는다.

## `@/types/database.types` (생성 파일 — `pnpm db:types`)
- `Database` — supabase 스키마 전체. **DB 행 타입을 손으로 적지 말고 여기서 뽑는다.**
  ```ts
  export type TransferDealRow = Database["public"]["Tables"]["transfer_deal"]["Row"];
  ```
- 이미 뽑아 둔 것: `ProfileRow`(`@/entities/profile`), `TransferDealRow`·`TransferClubRow`·`TransferNewsRow`·`TransferDealWatchRow`(`entities/transfer/model/types` — 슬라이스 내부).

## `@/shared/api`
- `requireBrowserSupabase` — 브라우저 supabase 클라이언트(`SupabaseClient<Database>`, 없으면 한국어 에러 throw). **쿼리·뮤테이션 훅은 이걸 쓴다** — null 가드를 각자 반복하지 않는다.
- `getBrowserSupabase` — null을 그대로 받아 분기해야 할 때만.
- `toDbErrorMessage` — PostgREST/RPC 에러 → 한국어. `P0001`(우리가 띄운 메시지)은 그대로 통과시킨다. 작성자 FK(`…_user_id_fkey`) 위반 23503은 "계정 정보를 찾을 수 없어요"로 접는다(탈퇴·삭제된 계정의 세션이 남은 채 쓴 경우).
- **`toWriteErrorMessage(supabase, error)`** — 로그인이 필요한 쓰기의 에러 → 한국어. 42501이면 세션을 확인해 세션이 없을 때 "로그인이 풀렸어요"로 바꾸고, 나머지는 `toDbErrorMessage`와 같다. 로그인 필수 쓰기 훅은 이것을 쓴다(`data-and-state.md`).
- ⚠ `createSupabaseServerClient`는 배럴에 없다 — `@/shared/api/supabase-server`를 직접 import(`next/headers` 의존).
- **`createSupabaseAnonClient` / `ANON_REVALIDATE`** (`@/shared/api/supabase-anon` 직접 경로) — 쿠키를 읽지 않는 서버 클라이언트. fetch가 Next Data Cache를 타므로 **응답이 모든 익명 요청에 동일한 조회에만** 쓴다. 새로 만들지 말 것 — 수명 상수가 TanStack `staleTime`과 한 값으로 묶여 있다(`nextjs.md`). ⚠ 캐시 히트가 DB를 없애는 것이지 **왕복이 0이 되는 것은 아니다** — in-flight 중복 제거가 없어 캐시가 빈 순간의 동시 요청은 전부 통과한다.
- **`hasSessionCookie()`** (같은 자리, `supabase-server`) — 이 요청에 세션이 있는지를 **네트워크 없이** 판정. 위 두 클라이언트를 고르는 데만 쓴다. ⚠ `getUser()`로 바꾸지 말 것(로그인 사용자에게 GoTrue 왕복이 하나 더 붙는다). ⚠ 판정을 **좁히지 말 것** — 넓게 잡혀 있어야 헛짚어도 평소 경로로 갈 뿐이고, 좁히면 로그인 사용자가 관심 표시가 빠진 익명 목록을 받는다.

## `@/entities/session`
- `useSessionStore` — zustand 세션 스토어. 셀렉터로 구독한다.
- `AuthProvider` — 세션 동기화의 마운트 지점. `QueryClientProvider` 안쪽에 둔다.
  로직은 `use-session-sync`(`onAuthStateChange` ↔ 스토어 + 유저 전환 시 캐시 리싱크)와
  `use-server-session-check`(로그인 시 1회 서버 검증)가 나눠 갖는다.
- `AuthRequired` / `GuestOnly` — 클라이언트 라우트 가드. 렌더 분기만 갖고,
  **이동은 `use-auth-redirect`가 소유한다** — 로그인 후 목적지를 정하는 곳은 앱에서 거기 하나다.
- **`useLastAuthProvider()`** — 마지막으로 로그인에 성공한 소셜 프로바이더(로그인 화면의 "최근 사용" 배지). ⚠ 순수 리더가 아니라 **훅**을 노출한다 — 그대로 내보내면 호출부마다 "렌더 중에 부르면 하이드레이션이 깨진다"를 기억해야 하는데 그런 방어는 방어가 아니다(`useNextParam`과 같은 형태).
- **`markSignOutIntent()` / `clearSignOutIntent()`** — "사용자가 직접 로그아웃했다"는 1회성 신호. `features/sign-out`이 **`signOut()`을 부르기 전에** 찍고, 실패하면 버린다. 가드가 이걸 보고 목적지를 가른다(직접 로그아웃 → 이적시장 목록 / 세션 만료·비로그인 진입 → 로그인 화면 + `?next=`).
  ⚠ **로그아웃 후 이동을 호출부에서 하지 말 것** — 성공 콜백은 화면이 먼저 언마운트되어 실행되지 않고, `mutate` 직전 `router.replace`는 가드의 이동과 순서 보장이 없다(나중 이동이 앞 이동을 취소한다). 목적지는 가드가 소유하고 호출부는 신호만 남긴다.
  ⚠ **신호는 전역이고 가드는 여럿이다** — 가드가 쓰지 않을 때도 읽어서 버리고, "이 화면에서 세션이 사라졌는가"를 함께 본다. 안 그러면 남은 신호를 다른 가드가 먹어 비로그인 사용자가 로그인 화면 대신 목록으로 되튕긴다.
- `toAuthErrorMessage` / `authErrorMessageFor` — supabase `AuthError` → 한국어. **`toDbErrorMessage`와 합치지 않는다**(데이터가 다르다).
  ⚠ 새 인증 흐름을 붙이면 **여기 커버리지부터 확인한다** — identity 코드를 빠뜨렸더니 "이미 다른 계정에 연결됨"처럼 재시도로 절대 안 풀리는 실패가 "잠시 후 다시 시도"로 접혔다.
- **`useLinkedIdentitiesQuery(userId)` / `identityKeys`** — 연결된 로그인 수단 조회. 조회는 여기, 쓰기(연결·해제)는 `features/link-identity`다(`entities/transfer` ↔ `features/watch-transfer`와 같은 분업). ⚠ 키를 **userId로 스코프**한다 — 계정 전환 시 이전 사용자의 목록이 노출되지 않게.

## `@/entities/profile`
- `useProfileQuery(userId)` / `profileKeys` / `PROFILE_SELECT` / `buildProfile` — 닉네임·아바타 조회.
- `MyProfile` / `ProfileRow` — 도메인 타입 / DB 행 타입. `MyProfile.avatarPath`는 **경로**다(전체 URL이 아니다).
- ⚠ **`userId`를 인자로 받는다.** 세션을 직접 읽지 않는 이유는 `entities`끼리 서로 import할 수 없기 때문이다 — 세션을 아는 **상위 레이어**(`views/profile`이 선례)가 `user?.id`를 넘긴다.
- ⚠ **`avatarUrl`은 여기 없다 → `@/shared/config`.** 작성자 아바타를 그리는 엔티티가 다시 생기면 entities끼리는 import할 수 없어서다(`OAUTH_PROVIDERS`와 같은 사정).
- ⚠ **profiles 컬럼을 다른 엔티티의 select에 임베딩하면 `features/update-profile`의 무효화 대상도 함께 늘려야 한다.** 프로필을 바꿔도 그 캐시는 저절로 갱신되지 않아 옛 값이 남는다.
- 서버에서는 배럴 대신 `model/types`·`api/keys`·`api/mappers`를 직접 import.

## `@/features/update-profile`
- `useUpdateNickname` / `validateNickname` / `NICKNAME_LIMIT` — 닉네임 변경과 그 검증. 검증은 **정규형**으로 재고(`normalizeNickname` → `lengthOverflow` → `isPlainNickname`) 뷰는 문구만 받는다.
- `useUpdateAvatar` / `ACCEPTED_IMAGE_TYPES` — 아바타 업로드(정사각 crop + webp 리사이즈는 슬라이스 내부 `resizeToAvatar`). ⚠ 받는 형식·원본 상한은 **기능마다 다르므로** 각 feature가 갖는다 — 이미지를 받는 기능이 또 생기면 리사이즈 메커니즘만 `shared`로 올리고 형식·상한은 각자 둔다(정사각 crop은 본문 사진에 쓰면 내용이 날아가 형태가 같지 않다).

## `@/entities/transfer`
- `useTransferDealListQuery(userId, scopeStartIso, enabled, initialData)` / `useTransferDealQuery(dealId, userId, enabled, initialData)` / `useTransferReportsQuery(dealId, enabled, initialData)` — 보드 목록(범위 안 전부) · 딜 단건 · 상세 보도 타임라인.
  ⚠ **목록·상세는 `userId`로 스코프된다**(관심 임베딩이 "내 행만"이라 응답 자체가 "나"에 종속된다). **타임라인은 스코프되지 않는다**("나"에 종속된 값이 없다).
  ⚠ **리그·정렬은 쿼리 키에 넣지 않는다** — 서버가 범위 안 딜 **전체**(≤`TRANSFER_DEAL_LIMIT`)를 내리고 뷰(`sortDeals`·`groupDeals`·`dealInLeague`)가 같은 데이터로 계산한다. 필터를 키에 넣으면 `initialData`가 캐시에 닿지 못하는 사고가 난다(`nextjs.md`의 실측 사고와 같은 함정).
  ⚠ `initialData`의 `undefined`(프리페치 안 함·실패)와 `[]`(받았는데 없다)는 다른 뜻이다.
- `transferKeys` — 쿼리 키. `list`는 `userId`·`scopeStartIso`(범위 시작 ISO, **분 단위로 내린 값**)를 함께 받는다.
- **`buildDealListQuery` / `buildDealQuery` / `buildReportsQuery`**(`api/list-query.ts` — 서버 안전) — 목록·단건·타임라인 조립의 단일 소스. 훅과 SSR 페이지가 **같은 함수**를 부른다 — 서버가 정렬·상한·select를 다시 짜면 하이드레이션 직후 목록이 재배열된다.
- `TRANSFER_DEAL_LIMIT` — 목록 상한(`api/mappers.ts` — SSR과 공유해야 해서 `"use client"`가 아닌 파일에 있다). **화면이 잘림을 안내해야 한다** — 조용히 자르면 그 뒤 항목은 URL을 아는 사람 말고는 도달할 방법이 없다.
- **`pickRecentRumors(deals, nowMs)`** — "최근 3일 소식" 캐러셀 대상(믿을 만한 출처 · 3일 이내). 믿을 만한 출처는 🎖️ 매체와 🌕·🌖 기자다(`isTopCredibility` — 화면 뱃지와 같은 등급이라 표시와 채택 기준이 갈리지 않는다). ⚠ **최신 보도의 출처로 판정한다** — 목록 select의 최신 보도 임베딩(`limit 1`)만 보므로, 최신 보도의 등급이 낮으면 그 앞의 믿을 만한 보도가 있어도 그 딜은 빠진다(딜마다 보도 전체를 싣는 비용을 들이지 않기로 한 트레이드오프). 결렬 딜도 포함한다. ⚠ `nowMs`를 인자로 받는다(`formatRelativeTime`과 같은 이유) — 매퍼에 넣으면 순수·서버 안전이 깨지고 같은 행이 호출 시점마다 달라진다. 서버 시각이 있으면 그 값을 넘긴다.
- **`FeeValue`** — 이적료 칸의 값. 금액이면 `€95M`(mono), 자유계약이 **확인된** 딜이면 `FA(자유 계약)`, 아니면 `미공개`(흐리게). 실제 이적료가 아닌 금액에는 성격을 작게 붙인다(`£86M 요구액`) — 금액만 두면 그 값에 이적한 것으로 읽힌다. 칸의 제목이 성격을 말하는 자리(상세 카드 — **`feeKindLabel(deal.feeKind)`**)만 `caption={false}`로 끈다. ⚠ 성격 라벨을 호출부가 다시 적지 말 것 — `Record<transfer_fee_kind, string>` 한 곳이 갖는다(`lib/fee.ts`). ⚠ **빈 이적료를 FA로 추정하지 않는다** — 판정은 `feeLabel`이 단독으로 갖고 근거는 파생기의 `is_free_agent`다(`api-and-db.md`). 이적료 칸을 새로 그릴 때 `formatFee(...) ?? "—"`를 직접 짜지 말 것.
- **`formatFee({amount, currency})`** — 이적료 표기(`€95M`). **`formatFeeRange(deal)`** 은 그 딜의 보도 이적료 최소–최대(`€58–95M`, 같으면 한 값). ⚠ `min(prev,fee)–(fee+add)` 공식을 쓰지 않는다 — 하락 딜에서 `€58–58M`로 퇴화한다. 직전 보도 대비 변동폭은 `FeeDelta`가 그린다 — 통화 변환은 하지 않는다(파생기가 `prevFeeAmount`에 같은 통화 값만 넣는다).
- **`reporterName(report)`** — 보도 주체의 한국어 표기(기자는 전체 이름 "벤 제이콥스", 매체는 매체명 "BBC"). 캐러셀·목록·타임라인이 **이것 하나**를 쓴다 — 소스 등록용 영어 라벨을 화면에 따로 그리면 같은 기자가 화면마다 "Fabrizio Romano"·"파브리지오 로마노"로 갈린다. ⚠ **단일 소스는 `scripts/lib/transfer/reporters.json`** 이다(파이프라인이 TS를 못 읽어 JSON이 원본이다). 우선순위는 `bylines → sources → journalists → attributed_to 원문 → source_id`다. ⚠ **가십 칼럼이 인용한 신문의 보도(`attribution = 'cited'`)는 그보다 먼저 `cited` 표기(없으면 칼럼이 적은 원문 표기)다** — 소스가 BBC Sport 피드여도 BBC의 보도가 아니라서, 소스 표기로 떨어뜨리면 팀토크의 이적설이 "BBC"로 그려진다(운영 실측). 접는 규칙(`citedKey`)은 `reporter.ts` 하나가 갖는다.
- **`TRANSFER_LEAGUES`** — 리그 시트의 노출 순서(5대 리그). `TransferLeague` 유니온과 `as const satisfies` + 망라성 가드로 서로 대조한다 — DB `transfer_club.league`가 enum이 아니라 `text + check`라 생성 타입에서 못 뽑아 손으로 적었기 때문이다.
- **`dealInLeague(deal, league)` / `dealHasClub(deal, code)` / `parseTransferLeague(value)` / `parseTransferSort(value)` / `parseTransferClub(value)`** — 리그 필터(출발 **또는** 도착 일치, `null`은 전체) · 구단 필터(출발·행선지·관심 구단 어느 자리든) · URL `?league=`·`?sort=`·`?club=` 해석. 구단은 형식만 검사하고 보드에 없는 코드는 뷰가 전체로 폴백한다(창이 지나 사라진 구단의 공유 링크). ⚠ **모르는 리그는 `null`(전체로 폴백), 모르는 정렬은 `latest`로 폴백** — 파라미터 오염이 404를 양산하면 안 된다(`nextjs.md`의 필터 절). 링크를 만드는 곳과 URL을 해석하는 곳이 갈리면 조용히 어긋나므로 **역방향 판정을 호출부가 직접 짜지 말 것**. 보드는 이 판정을 서버가 아니라 뷰가 주소에서 한다(`views/transfer-board`의 `useBoardFilters`).
- **`splitHotRumors(deals, nowMs, sort)`** — 루머 구간을 펼칠 것(식지 않은 것 중 열기 상위 10건 — 보도 수·최신 보도 공신력·최근성)과 접을 것으로 가른다. 7일 무소식 루머는 점수와 무관하게 접는다. 접힌 행도 HTML에 남기고 `hidden`으로 가린다 — 무한 스크롤·서버 페이지네이션 대신 이 접기가 긴 구간을 감당한다(본문 SSR·구간 점프·스크롤 복원 유지).
- **`splitProgress(deals)`** — 진행 중 구간을 합의 임박(메디컬·개인 조건·합의) / 협상 중(제안·협상)으로 가른다. 뱃지 톤(`STAGE_STATUS`)과 같은 갈림이라 라벨도 `STATUS_LABEL`을 쓴다.
- **`groupDeals(deals)` / `sortDeals(deals, sort)`** — 정렬 → 구간 분류. `sortDeals`가 **먼저**다(안정 정렬 — 같은 값끼리는 서버가 준 순서를 유지한다). `groupDeals`는 **빈 구간을 뺀다**(구간 점프 칩은 `GROUP_ORDER`·`GROUP_LABEL`을 직접 돌아 빈 구간도 0건으로 그린다).
- `GROUP_LABEL` / `GROUP_ORDER` — 보드 구간(오피셜·합의 완료·진행 중·루머·결렬·부인)의 라벨·고정 순서. 결렬(`collapsed`)과 부인(`denied`)은 같은 구간이고 뱃지·아이콘(⊗/⊘)이 가른다 — 판정은 `isDeadStage`와 `stage === "denied"` 둘뿐이다.
- **`CredibilityBadge`** — 출처 공신력: 🎖️(오피셜에 육박하는 매체에만) 또는 🌑~🌕(그 밖의 매체와 기자 — 5단계). 등급의 단일 소스는 `scripts/lib/transfer/reporters.json`의 `credibility`다 — 매체는 **소스 id**로(같은 "BBC" 표기를 BBC Sport와 BBC 이적 가십이 함께 쓴다), 기자는 보도 주체 표기로 매긴다. 가십 칼럼이 인용한 신문의 보도(`cited`)는 소스 id보다 먼저 **`cited`의 등급(1~5, 🎖️ 없음)** 이다 — 칼럼 소스의 🎖️는 칼럼의 것이지 옮겨 적은 타블로이드의 것이 아니다. 등재되지 않은 출처는 그리지 않는다. ⚠ 🎖은 **U+FE0F를 붙여야** Windows에서 컬러로 그려진다(기본 표시가 글자다). ⚠ 이모지는 `aria-hidden`이고 뜻은 `sr-only` 글자가 진다 — 스크린리더는 이모지를 모양 이름("보름달")으로 읽는다. DB의 `tier`(1·2)는 수집기의 귀속 판정용이라 화면에 쓰지 않는다.
- **`routeLabels(deal, { full })` / `destinationClubs(deal)`** — 경로 두 칸의 글자와 행선지 자리의 구단들. 빈 칸의 문구(자유계약 출발 `FA` · 모르는 출발 `미확인` · 아직 정해지지 않은 행선지 `미정`)를 **여기 하나가** 정하고, 관심 구단이 여럿이면 앞 `ROUTE_CLUB_LIMIT`개를 `·`로 잇고 나머지를 `외 N`으로 센다(전부 이으면 목록 행이 세 줄로 부풀어 이적료 칸을 밀어냈다). 엠블럼은 슬라이스 내부의 `CrestStack`이 같은 수만큼 겹치고 나머지를 `+N`으로 접는다 — 이름과 엠블럼이 같은 구단을 가리켜야 한다. ⚠ **상세 경로 카드만 전부 적는다** — 폭을 이름에 전부 내줄 수 있는 유일한 자리라 접지 않고, `·`로 잇는 대신 **한 줄에 엠블럼 하나 + 정식명 하나**로 세운다(`views/transfer-detail`의 `RouteCell`). 그 밖의 자리(목록 행·미니 카드·캐러셀)는 이 글자를 그대로 쓴다. `full`이면 정식명, 아니면 약칭.
- `DealRow` / `DealMiniCard` / `RumorCard` / `StatusBadge` / `FeeDelta` / `TransferCrest` — 목록 행 · 미니 카드 · 캐러셀 카드 · 상태 뱃지 · 변동폭 · 구단 엠블럼(`Crest`의 얇은 래퍼 — 코드로 경로를 조립하는 도메인 지식만 갖는다). ⚠ `CrestStack`(엠블럼 겹치기)은 배럴에 없다 — 슬라이스 밖 소비자가 0이다.
  ⚠ **엠블럼을 직접 `<img>`로 그리지 말 것** — 폴백이 두 갈래인데 둘 다 필요하다: 코드가 비었을 때와, **파일이 없어 404일 때**(새 구단이 생기면 반드시 겪는다). 메커니즘은 `@/shared/ui`의 `Crest`가 갖는다.
- ⚠ **한국어로는 "이적시장"·"딜"로 부른다.** URL(`/transfers`)·테이블(`transfer_deal`)·식별자(`transfer`)는 그대로 두고 화면·주석의 한국어만 통일한다.
- ⚠ **`TransferClub`·`STAGE_GROUP`·`isDeadStage`·`feeDelta`·`ClubRoute`·`WatchMark`는 배럴에 없다** — 슬라이스 밖 소비자가 0이라 올리지 않았다. `STAGE_STATUS`·`STATUS_LABEL`도 배럴에는 없지만 서버 page가 `lib/stage` 직접 경로로 쓴다(og description). `check:conventions`는 상대 경로 소비를 현역으로 세어 이 유형을 잡지 못하므로 손으로 지킨다.
- 서버에서는 배럴 대신 `model/types`·`api/mappers`·`api/keys`·`api/list-query`·`lib/stage`·`lib/route-label`·`lib/player-name`을 직접 import.

## `@/entities/comment`
- `useCommentListQuery({ dealId, userId, enabled, initialData, initialDataUpdatedAt, placeholderData })` / `commentKeys` — 딜의 댓글(최신 `COMMENT_LIST_LIMIT`건, 화면에는 오래된 순). ⚠ **userId로 스코프된다**(내 표 `my_vote` 임베딩이 "내 행만"). 쓰기 뒤 무효화는 사용자 무관 prefix `commentKeys.deal(dealId)`로 잡고, 표의 낙관적 갱신은 **내 키**(`commentKeys.list(dealId, userId)`)만 고친다. ⚠ `initialDataUpdatedAt`에 서버가 읽은 시각을 넣는다 — 빼면 뒤로가기가 되살린 옛 서버 페이로드가 신선한 것으로 앉는다. 서버가 **다른 사용자**로 그린 목록은 `initialData`가 아니라 내 표를 지운 `placeholderData`로 넘긴다(`withoutMyVotes`).
- **`buildCommentListQuery` / `buildCommentList`**(`api/list-query.ts`·`api/mappers.ts` — 서버 안전) — 조립(최신순 + 상한+1건)과 자르기·뒤집기의 단일 소스. 훅과 상세 SSR이 **같은 함수**를 부른다. ⚠ 한 건 더 받아 `truncated`를 **정확히** 판정한다 — 상한과 같은 수로 "잘렸다"고 하면 정확히 상한만큼인 딜에서 거짓말이다.
- **`buildCommentThreads(comments)`** — 평면 목록 → 깊이 1 스레드. ⚠ 부모가 잘려 나간 답글은 **버리지 않고 루트로 승격**한다.
- **`sortThreads(threads, sort)`** — 루트만 정렬(인기순 = 좋아요−싫어요, 동점은 최신 · 최신순). 답글은 작성순 그대로. ⚠ 인기순 점수에서 **이번에 누른 변화분**(`myVote − fetchedVote`)을 뺀다 — 누르는 순간 그 댓글이 손가락 밑에서 튀지 않게. 받아 올 때 이미 있던 내 표는 점수에 남는다(다시 열었을 때 순서가 바뀌지 않게). 정렬은 쿼리 키에 넣지 않는다.
- `CommentItem` — 댓글 한 개(`article`). 표·답글·삭제 줄(`actions`)과 답글 목록(`children`)은 **뷰가 조립해 넘긴다**(쓰기는 features다). `"use client"`가 없다.
- `COMMENT_LIST_LIMIT` — 목록 상한(서버 안전한 `api/mappers.ts`). 화면이 잘림을 안내한다.
- **`applyVote(list, commentId, next)`** — 목록에 목표 표를 입히는 계산(멱등). 표의 낙관적 갱신과 목록 조회(`applyPendingVotes` — 아직 끝나지 않은 표와 **그 조회가 시작된 뒤 커밋된 표**(`recordSettledVote`)를 덮는다)가 **같은 함수**를 쓴다. 표 뮤테이션 키는 `commentKeys.voteMutation(dealId)`.
- **`refreshCommentLists(queryClient, dealId)`** — 쓰기(작성·삭제) 뒤 목록을 다시 받을 때까지 기다린다(성공 토스트는 그 뒤 — 토스트와 목록 변경이 같은 순간). ⚠ 기다림에 **상한**(3초)이 있다 — 쓰기는 성공했는데 목록 조회가 계속 실패하면 재시도가 끝날 때까지 버튼 잠금·성공 토스트가 묶인다. ⚠ 이 리페치를 **되돌리며 취소**(`cancelQueries`)하는 호출부를 두지 않는다 — 취소되면 await가 받지도 않은 채 끝나 "등록했어요" 뒤 1초 넘게 새 댓글이 없다(실측). 겹친 리페치가 `cancelRefetch`로 새로 시작되는 것은 괜찮다(먼저 건 await가 새 조회에 얹힌다).
- 서버에서는 배럴 대신 `model/types`·`api/mappers`·`api/list-query`를 직접 import.

## `@/features/write-comment` · `delete-comment` · `vote-comment`
- `useWriteComment(dealId)` / `validateComment` / `isReplyTargetMissing(error)` — 댓글·답글 작성과 검증(`hasVisibleChar` → `lengthOverflow`, 한도 `COMMENT_LIMIT` — 값은 `api-and-db.md`의 길이 한도 표). ⚠ 무효화 Promise를 반환해 리페치까지 `isPending`을 유지한다. `isReplyTargetMissing`은 실패 사유가 "답글 대상이 지워졌다"(트리거의 P0001 문구)인지 판정한다 — 답글 칸이 같은 안내를 겹쳐 내지 않는 데만 쓰고, 문구는 마이그레이션과 글자 하나까지 같아야 한다. ⚠ **가드는 여기 없다** — 실패 시 입력창·답글 대상을 되돌리는 것은 화면의 상태라 `views/transfer-detail/model/use-comment-composer`가 조립한다.
- `useDeleteComment(dealId)` — 본인 댓글 hard delete. 0행이면 "이미 삭제된 댓글이에요."(실패해도 다시 받아 유령 행을 걷는다). 확인 다이얼로그·항목별 가드는 뷰 model(`use-comment-deletion`)이 갖는다. ⚠ 확인 문구의 답글 수는 **누르는 순간 목록을 다시 받아** 최신 캐시로 세고, 받는 동안에는 확인 버튼을 막는다(`Dialog`의 `confirmDisabled`) — 받기 전 문구로 확정하면 알리지 않은 남의 답글이 cascade로 지워진다.
- `CommentVoteButtons({ dealId, comment, onSignInRequired })` — 좋아요·싫어요. ⚠ 훅(`useVoteComment`)은 배럴에 없다(버튼이 유일한 호출부). 낙관적 갱신 + 같은 딜의 표를 `scope`로 직렬화 + "목표 표로 수렴"하는 요청 + 실패·0행만 줄 끝에서 한 번 재동기화(그때는 진행 중인 조회가 있어도 새로 받는다 — 표 때문에 조회를 취소하지는 않는다)(`data-and-state.md` 낙관적 업데이트 절). 가드도 `disabled`도 없다.
- ⚠ 세 슬라이스 모두 비로그인 안내를 직접 띄우지 않는다 — `onSignInRequired`로 올리고 **뷰가 `SignInDialog` 한 벌**을 문구만 바꿔 쓴다.

## `@/features/watch-transfer`
- `WatchToggle({ dealId, watched, onSignInRequired })` — 상세 하단의 관심 토글 하나. 조회는 `@/entities/transfer`다.
- ⚠ **훅(`useToggleTransferWatch`)은 배럴에 없다** — 토글은 상세 하나뿐이라 슬라이스 밖 호출부가 0이다(목록 행의 관심 표시는 표시일 뿐 토글이 아니다 — `WatchMark`는 `entities/transfer` 내부에서만 쓰인다).
- ⚠ 세션 `status`를 **3분기**한다(`loading`을 비로그인과 같이 다루면 콜드 로드 직후 로그인 사용자가 안내를 본다).
- ⚠ **비로그인에게도 버튼을 그대로 연결한다** — 눌러야 로그인 안내가 뜬다. 안내는 **뷰가 소유한다**(`onSignInRequired` 콜백). 컨트롤을 죽이고 옆에 "로그인하고 …하기" 링크를 다는 형태로 되돌리지 말 것: 사용자가 실제로 누르는 것은 컨트롤이라 **눌러도 아무 반응이 없는 UI**가 된다.
- ⚠ **가드가 없다** — 낙관적 업데이트의 목적이 즉시 반응이고, 연타해도 행은 복합 PK 하나뿐이다. `disabled`도 두지 않는다.
- ⚠ RPC가 없다 — 카운터가 없어 지킬 불변조건이 `(user_id, deal_id)` 기본키 하나뿐이다(`api-and-db.md`).
- ⚠ 이미 담긴 딜을 다시 담으면 **23505를 성공으로 흡수한다**(멱등 — `api-and-db.md`의 "설명과 흡수" 표).

## `@/features/sign-in` · `sign-out` · `link-identity`
- `useOAuthSignIn` — 소셜 로그인 시작. ⚠ **`start()` 안에 중복 실행 가드가 있다** — `signInWithOAuth`는 호출마다 새 PKCE code_verifier를 덮어쓰므로 두 호출이 겹치면 돌아온 code를 교환할 수 없다(`data-and-state.md`). `hasPkceVerifier`(서버는 `@/features/sign-in/lib/pkce-verifier` 직접 경로)는 복귀 화면이 교환 대기를 판정하는 데 쓴다.
- `useSignOut` — 로그아웃. ⚠ `scope: "local"`을 명시한다(기본값이 `global`이라 다른 기기까지 revoke된다). 이동은 가드가 한다(`markSignOutIntent`).
- `useLinkIdentity` / `useUnlinkIdentity` — 로그인 수단 연결·해제. ⚠ **맨 `mutate`를 내보내지 않는다** — 가드가 훅 안에 있고 `start`/`remove`만 노출해야 호출자가 가드를 복제할 필요가 없다. ⚠ 해제는 **boolean 전역 잠금**이다 — 지켜야 하는 것이 "목록이 0개가 되지 않는다"라 항목별 가드로는 못 지킨다(`data-and-state.md`).

## `@/shared/config`
- `ROUTES` — 경로 헬퍼. **경로 문자열 하드코딩 금지**(`"/transfers"` ❌ → `ROUTES.transferList`).
  ⚠ 이적시장은 **`ROUTES.transferList`**(`/transfers`) · `ROUTES.transfer(id)`(`/transfers/[id]`)다. 상세에는 탭바가 없다 — `activeTabHref`가 목록 경로만 센다.
  ⚠ `ROUTES.home`(`/`)은 화면이 아니라 이적시장으로의 리다이렉트다(`app/page.tsx`) — 링크 목적지로 쓰지 말고 실제 화면 경로를 쓴다.
- **`openTransferWindow(nowMs)` / `trackedTransferWindow(nowMs)` / `boardScopeStartMs(nowMs)`**(`transfer-window.ts`) — 이적 창 일정. 창의 기간은 리그별 일정을 합친 것이다(개장 = 가장 먼저 여는 리그, 마감 = 가장 늦게 닫는 리그). `openTransferWindow`는 **지금 열려 있는 창**(없으면 `null`) — 헤더의 "마감까지" 카운트다운은 이 값이 있을 때만 그리고 마감에 닿으면 스스로 사라진다. `trackedTransferWindow`는 보드가 추적하는 창(개장한 가장 최근 창 — 창 사이에는 방금 닫힌 창)으로 헤더의 창 이름이 쓰고, `boardScopeStartMs`는 그 창의 개장 시각(보드에 실을 딜의 하한)이다. ⚠ **단일 소스는 `scripts/lib/transfer/windows.json`** 이다 — 딜 파생 스크립트(Node)가 이 TS를 import할 수 없어 JSON이 원본이고, 이 파일은 그 JSON을 그대로 읽는다. **시즌마다 사람이 갱신한다** — 엠블럼(`public/crests`)·`team-names-ko.json`과 같은 운영 모델이라 런타임에 늘지 않는다.
- **`hasBottomBar(pathname)` / `activeTabHref(pathname)`** — 화면 아래에 고정 바(탭바 또는 딜 상세의 관심 토글 바)가 있는지와 활성인 탭. 탭바(`widgets`)는 `activeTabHref`를, 토스트(`shared/ui`)는 `hasBottomBar`를 본다. ⚠ 하단 고정 바를 새로 두는 화면이 생기면 `hasBottomBar`에 더한다 — 빠뜨리면 토스트가 그 바의 CTA를 덮는다. ⚠ 새 목록 경로가 생기면 여기부터 고친다 — 빠뜨리면 그 화면에서 **탭바가 사라지고 토스트가 탭바 자리로 내려간다.** 값이 유한하지 않은 경로(`/…/category/[slug]` 같은)가 생기면 정확 일치 배열이 아니라 접두 판정으로 둔다.
- `signInWithNext(pathname)` / `withNext(path, next)` — 복귀 경로를 붙인 URL. 이 형태를 만드는 곳이 가드·`SignInDialog`·`AuthStatus`로 여럿이라 여기로 모았다. ⚠ 액션 컨트롤에서 이걸로 **직접 이동하지 않는다** — `SignInDialog`가 안내를 끼고 그 안에서 부른다(예외는 라벨이 "로그인"인 컨트롤).
- **`safeNextPath(next, origin)`** — `?next=` 값을 앱 내부 경로로만 통과시킨다. **직접 문자열 검사를 짜지 말 것** — `startsWith("/") && !startsWith("//")`로는 `/\evil.com`도 `/..//evil.com`도 못 막는다(둘 다 실제로 뚫렸다).
- **`OAUTH_PROVIDERS` / `OAUTH_PROVIDER_LABEL`** — 지원 소셜 프로바이더의 단일 소스. `supabase/config.toml`의 `[auth.external.*]`와 갈리면 안 된다. ⚠ `shared`에 있는 이유는 로그인(`features/sign-in`)과 계정 연결(`features/link-identity`)이 같은 목록을 써야 하는데 features끼리는 import할 수 없어서다.
- **`avatarUrl(path)` / `AVATAR_BUCKET`** — 아바타 **경로** → 공개 URL. ⚠ DB에는 전체 URL이 아니라 경로만 저장한다(호스트가 환경마다 다르다: 로컬 `127.0.0.1:64321` ↔ 원격 `*.supabase.co`). 조립은 이 함수 한 곳에서만. 버킷명 문자열도 여기서 가져다 쓴다(`features/update-profile`이 선례).
- **`publicStorageUrl(bucket, path)`** — 공개 버킷 경로 → URL 조립의 **단일 소스**. 새 공개 버킷이 생기면 여기에 붙인다(버킷별 함수는 이 함수를 감싸기만 한다).
- **`OG_IMAGE` / `OG_SITE` / `NOT_FOUND_TITLE` / `absoluteUrl(path)`** — 세그먼트가 `openGraph`를 채울 때 함께 싣는 이미지·사이트 공통 값(`siteName`·`locale`), 없는 리소스의 메타데이터 제목(404 화면과 같아야 한다), 그리고 앱 경로 → 절대 URL. ⚠ `new URL(path, env.siteUrl)`을 호출부가 각자 짜지 말 것 — 사이트맵·`robots.txt`·`og:url` 셋이 **같은 URL**을 가리켜야 검색엔진·공유 플랫폼이 한 주소를 대표로 본다(canonical과도 같은 경로여야 한다).
- **`env`** — `NEXT_PUBLIC_*` 환경변수의 단일 소스(`supabaseUrl`·`supabaseAnonKey`·`siteUrl`·`googleSiteVerification`·`naverSiteVerification`). **`process.env`를 호출부에서 다시 읽지 말 것** — `proxy.ts`가 화면·훅과 같은 supabase 인스턴스를 봐야 세션 쿠키가 어긋나지 않는다.
  - `siteUrl`은 `og:image`를 절대 URL로 만드는 `metadataBase`(루트 layout)용이다. `NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` → `localhost:3000` 순으로 폴백한다.
- **`isSupabaseConfigured()`** — env가 채워졌는지. 값이 비어도 빌드는 성공해야 하므로 `env`는 throw하지 않는다 → **가드는 호출부의 책임**이고, 그 가드를 각자 짜지 말고 이걸 쓴다(`proxy.ts`가 선례).

## `@/shared/ui`
**현역(지금 화면이 실제로 쓰는 것)** — 새로 만들기 전 여기부터 확인:
`Button`·`buttonClassName`·`Icon`·`Skeleton`·`EmptyState`·`chipClassName`·`Dialog`·`SignInDialog`·`Sheet`·`SheetItem`·`ToastViewport`·`Pill`·`Avatar`·`Wordmark`·`TextField`·`StaleBanner`·`Crest`

**현재 미사용인 자산은 두지 않는다** — 호출부가 0인 export는 `pnpm check:conventions`가 막는다. 남겨야 할 이유가 있으면 사유와 함께 `scripts/check-conventions.mjs`의 `DOCUMENTED_UNUSED`에 적는다.

> ⚠ 이 두 목록은 **실사용 여부로만 판정한다** — 손으로 세지 말고 **`pnpm check:conventions`** 를 돌린다(호출부 0인 export를 전수로 뽑아 준다).
> **이 문서의 존재 이유가 "새로 만들기 전 확인"이라 목록이 틀리면 문서가 없느니만 못하다.** UI를 추가·제거하면 여기부터 고친다.

- **`Crest`** — 엠블럼류 이미지 + 하이드레이션 전 실패 감지 + 모노그램 폴백의 **공통 메커니즘**. `entities/transfer`의 `TransferCrest`가 이걸 감싼다(도메인 지식은 호출부가 `src`·`label`로 넘긴다). `"use client"` — 실패 감지가 `useEffect` + `onError`를 함께 쓴다. ⚠ `onError`만으로는 부족하다 — SSR HTML의 `<img>`는 **하이드레이션 전에** 실패할 수 있고 그러면 이벤트가 지나가 버린다(마운트 시 `complete && naturalWidth === 0`을 함께 확인하는 이유). `next/image`가 아니라 `<img>`다(`avatar.tsx`와 같은 판단 — 자산이 이미 목표 크기라 최적화 파이프라인이 줄 이득이 없다). ⚠ `Avatar`로 대신하지 말 것 — `rounded-full` + `object-cover`라 방패 모양 엠블럼의 모서리가 잘린다.
- `chipClassName(selected)` — 칩의 클래스만. **`rounded-sm`(6px)** 이다 — 칩이라고 알약이 아니다(`styling.md`). 이동이면 링크(`<Link>`, 이적 보드 필터는 `BoardLink`)에, 선택이면 `button`에 이 클래스를 입힌다(앵커 안에 `button`을 넣지 않는다). 분리 사유는 `Button`↔`buttonClassName`과 같다.
- `Dialog` / `Sheet`(+`SheetItem`) — 확인 대화상자 / 하단 시트. 포커스 가둠은 `@/shared/lib`의 `useFocusTrap`.
  - `Sheet`는 화면 하단에 붙는 **edge-to-edge** 시트다(`styling.md`). "닫기" 행을 두지 않는다.
  - ⚠ 닫기 수단은 스크림 탭 · Escape · 스와이프인데 **셋 다 포인터이거나 물리 키보드다.** 그래서 그래버가 `button aria-label="닫기"`를 겸한다 — 시트 안 항목이 전부 비활성인 메뉴가 생기면 **활성 컨트롤이 0개**가 되고, 그때 스크린리더·키보드의 유일한 탈출구가 이 버튼이다. `div`로 되돌리지 말 것.
  - ⚠ 진입·퇴장 애니메이션은 **바깥 요소**, 드래그 오프셋은 **안쪽 래퍼**가 갖는다. 한 요소에 겹치면 CSS animation이 캐스케이드에서 inline style을 이겨 드래그가 통째로 무시된다. 새 오버레이에 드래그를 붙일 때 같은 함정을 밟지 말 것.
  - ⚠ 시트 위에 시트를 겹치지 않는다 — `useFocusTrap`이 이중이 되어 Escape·Tab 가둠이 둘이 되고 `aria-modal` 노드도 둘이 된다. 한 시트의 **children만 바꾼다**(한 상태로 `"none" | "menu" | …`를 갖는다).
- **`SignInDialog`** — "로그인이 필요해요" 안내. **로그인이 필요한 액션을 비로그인이 눌렀을 때 `router.push(signInWithNext(...))`로 곧바로 화면을 갈아치우지 않는다** — 무엇 때문에 화면을 잃는지 모른 채 이동하게 되고, 되돌아올 길도 없다. 문구는 `action`(`"관심 목록에 담으려면"`처럼 **`~하려면`으로 끝나는 구절**) 하나만 받고 나머지 문장은 컴포넌트가 갖는다.
  - ⚠ **예외는 대놓고 "로그인"이라고 쓰인 컨트롤이다** — `AuthStatus`의 로그인 버튼은 목적지가 라벨에 적혀 있어 한 단계 더 묻는 것이 방해다. 그대로 `signInWithNext`로 보낸다.
  - ⚠ **화면을 떠나는 동작에는 `next`를 준다**(프로필 탭 → `/profile`). 기본값(지금 화면)으로 두면 로그인하고 돌아와서 그 동작을 처음부터 다시 눌러야 한다.
  - ⚠ **열림 상태는 호출부가 갖고, 렌더 자리는 스크롤 영역 밖이다.** `Dialog`가 `absolute`라 스크롤 컨테이너 안에 두면 스크롤한 만큼 화면 밖에 뜨고, 목록에서는 항목 수만큼 생긴다 → 액션 컴포넌트(`WatchToggle`)는 `onSignInRequired` 콜백만 올리고 **뷰가 한 벌** 렌더한다. 한 화면의 여러 액션은 **문구만 다른 한 벌**을 공유한다.
  - ⚠ **앵커는 앵커로 남긴다.** 크롤 가능한 링크(프로필 탭)는 `<Link>`를 유지하고 `onClick`에서 비로그인일 때만 `preventDefault`한다 — 그 앵커가 크롤러의 발견 경로이고 `robots.txt`가 아무것도 막지 않는 근거다(`nextjs.md`).
  - ⚠ 세션 `status`는 **3분기**한다 — `loading`에 가로채면 복원 중인 로그인 사용자가 안내를 본다.
- `StaleBanner` — 리페치 실패를 **데이터를 유지한 채** 알리는 배너. ⚠ 호출부의 조건은 반드시 `error && data`다 — `error`를 데이터 렌더보다 먼저 보면 네트워크가 잠깐 끊겨도 읽고 있던 목록이 통째로 사라진다(`data-and-state.md`). 목적격 조사(을/를)는 컴포넌트가 받침으로 판정하므로 **명사만** 넘긴다.
- `ToastViewport` — 루트(`AppProviders`)에 **하나만** 둔다. 발행 API(`useToast`)는 `@/shared/lib`에 있다.
  - ⚠ **앱의 유일한 라이브 리전이다.** 문구가 없어도 언마운트하지 않는다(리전과 내용이 함께 마운트되면 발화가 불안정하다) — `if (!message) return null`로 되돌리지 말 것. 화면마다 `role="status"`를 새로 만들지 않는 이유는 `code-quality.md`에.
- ⚠ `Link` 안에 `Button`을 넣지 않는다(`<a>` 안의 `<button>`). 버튼형 링크는 `buttonClassName({...})`을 `Link`의 className에 준다.

## `@/widgets`
- `AppBar` — 목록 화면 상단(워드마크 + `leading` 슬롯).
- `BottomTabBar` — 하단 탭바. **`backdrop-blur`가 허용된 유일한 요소**다(`styling.md`).
  - 탭 목록은 이적시장(`ROUTES.transferList`, 아이콘 `ArrowLeftRight`)·프로필 순이다.
  - ⚠ **로그인해야 열리는 탭을 추가하면 `signInAction` 문구를 함께 적는다.** 그 값이 있는 탭만 비로그인의 이동을 가로채 `SignInDialog`를 띄운다 — 앵커는 그대로 두고 `preventDefault`만 한다. 빠뜨리면 그 탭은 안내 없이 이동했다가 `AuthRequired`에 막혀 로그인 화면으로 떨궈진다.
  - ⚠ 그 다이얼로그는 `<nav>`의 **형제**여야 한다. 탭바가 `absolute`라 자기 안의 `Dialog`에게 컨테이닝 블록이 되어, 안에 두면 알약 한가운데에 뜬다.
- `SubHeader` — 상세 화면 상단(뒤로가기 + 공유).
- `TabScrollArea` — 목록 스크롤 영역(`<main>` 제공 + 스크롤 복원).
- `AuthShell` — 인증 화면의 공통 껍데기.
- `AuthStatus` — **비로그인일 때의 로그인 링크**만 그린다(로그인 상태에서는 `null`). ⚠ 라벨이 "로그인"이라 `SignInDialog`를 거치지 않고 곧바로 이동한다 — 목적지가 라벨에 적혀 있어 한 단계 더 묻는 것이 방해다.
  ⚠ 계정 관련 동작(닉네임 표시·로그아웃)을 여기 되넣지 않는다 — 프로필 화면과 두 곳으로 갈린다. 프로필 진입은 하단 탭바가 상시 제공하고, **로그아웃은 `views/profile`이 단독으로 갖는다.**
