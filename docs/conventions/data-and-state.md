# 데이터·상태 컨벤션

## 데이터 접근

- 클라이언트 데이터는 **TanStack Query 훅**으로만 가져온다(`entities/*/api`의 `use*Query`). 컴포넌트에서 `fetch`나 `supabase.from()`을 직접 부르지 않는다.
- 로딩은 **Skeleton**(화면 구조 유지), 에러·빈 상태는 **EmptyState**. 로딩 중 레이아웃이 튀지 않게 한다.
- 에러 메시지는 훅이 이미 한국어로 바꿔 던진다 → 컴포넌트는 `error.message`를 노출만 한다. 변환기는 두 개이고 **일부러 합치지 않았다**(데이터가 다르다):
  - `toAuthErrorMessage` (`@/entities/session`) — supabase `AuthError`
  - `toDbErrorMessage` (`@/shared/api`) — PostgREST/RPC 에러
- Vercel 스킬 `client-swr-dedup`은 요청 중복 제거를 **SWR**로 예시하지만, 이 프로젝트는 동일 목적(중복 제거·캐싱)을 TanStack Query로 달성한다. **SWR API는 도입하지 않는다** — 원칙(raw 호출 금지·중복 제거)만 취하고 라이브러리는 기존 스택을 따른다.

## 세션 상태

- 세션의 **단일 소스는 supabase**이고, zustand 스토어(`useSessionStore`)는 그 사본이다. 로그인·로그아웃 훅에서 스토어를 직접 세팅하지 않는다 — `onAuthStateChange`를 받은 `AuthProvider`만 `applySession`을 부른다.
- `status`는 `"loading" | "authenticated" | "guest"` **명시 필드**다. `user !== null`에서 파생시키면 "복원 전"과 "비로그인"이 구분되지 않아, 새로고침할 때 비로그인 UI가 잠깐 보였다 바뀌는 깜빡임을 막을 수 없다.
- 구독은 반드시 셀렉터로: `useSessionStore((s) => s.user)`.
- ⚠ `onAuthStateChange` 콜백을 **async로 만들지 않는다**. `@supabase/auth-js` 2.110에서 async 오버로드는 `@deprecated`이며 `TOKEN_REFRESHED` 처리 중 중첩 리프레시가 나면 데드락된다. 콜백 안에서 `supabase.auth.*`를 다시 호출하는 것도 금지.
- 캐시 무효화는 `SIGNED_IN`·`SIGNED_OUT`·`USER_UPDATED`에서만 한다. `TOKEN_REFRESHED`까지 포함하면 토큰 갱신마다 화면 전체가 리페치된다.

## 하이드레이션

- 렌더 중 `Date.now()` / `new Date()` / `Math.random()` **직접 호출 금지**. 날짜 표시는 헬퍼로(`formatRelativeTime`·`formatYearMonth`·`todayUtc`).
- ⚠ **헬퍼가 하이드레이션 안전을 보장하지는 않는다.** `formatRelativeTime`은 내부에서 `Date.now()`를 호출한다. 현재 목록·상세가 전부 클라이언트 쿼리라 SSR HTML이 항상 스켈레톤이어서 안전할 뿐이다.
- **서버 프리페치를 붙이는 순간 깨진다.** 지배 변수는 SSR↔하이드레이션 지연이 아니라 **사용자 기기의 시계 오차**다(서버는 NTP 동기 시각, 브라우저는 기기 시각). 그때는 응답에 **서버 기준 시각을 실어 초기 렌더에 쓰거나**, 카드에 절대시각을 렌더하고 상대시각은 마운트 후 교체한다.
- `suppressHydrationWarning`으로 덮지 않는다(원인 은폐). Vercel 스킬 `rendering-hydration-suppress-warning`도 이 규칙보다 우선하지 않는다.
- 목/시드 값도 정적 상수로 둔다(렌더마다 값이 바뀌면 안 됨).

## 뮤테이션

- 로그인이 필요한 액션은 UI에서 `useSessionStore`의 `status`로 유도하고(로그인 링크), **실제 차단은 RLS와 함수 EXECUTE 권한이 한다.** 훅의 `if (!user) throw`는 이중 방어일 뿐이다.
- 결과가 여러 화면에 걸치면 `onSuccess`에서 관련 `queryKey`를 무효화한다. 카운터가 DB 트리거로 움직이면(댓글 수) **글 캐시도 함께** 무효화해야 화면에 반영된다.
- 에러는 훅에서 `console.error`로 원본을 남기고 한국어 메시지로 바꿔 throw한다(로깅은 훅, 노출은 컴포넌트).

### 무효화 Promise를 반환할 때 vs 말 때

| 상황 | 처리 | 이유 |
|---|---|---|
| 낙관적 업데이트 **없음** (댓글 작성) | `onSuccess`에서 무효화 **Promise 반환** | 리페치 완료까지 `isPending` 유지 → 입력창이 비워지기 전 재클릭으로 중복 등록되는 레이스를 막는다 |
| 낙관적 업데이트 **있음** (좋아요) | `onSettled`에서 무효화, **반환 안 함** | 화면이 이미 정답을 보여주고 있다. `isPending`을 늘리면 연타만 막혀 반응이 둔해진다 |
| 성공 직후 **화면을 떠남** (글 삭제) | 무효화하되 **반환 안 함** | 반환하면 상세 쿼리가 먼저 리페치되어 null이 되고, "글을 찾을 수 없어요"가 깜빡인 뒤에야 이동한다. 이동 자체가 성공 표시라 리페치를 기다릴 이유가 없다 (선례 `use-delete-post`) |

### ⚠ `disabled={isPending}`는 중복 제출을 막지 못한다

`isPending`은 **렌더 이후에야** DOM에 반영되는데 TanStack Query의 상태 변경은
마이크로태스크로 배치된다. 그래서 첫 클릭과 거의 동시에 들어온 두 번째 클릭은
아직 enabled인 버튼을 누른다 — 실측에서 3연타에 **같은 글이 3개 생성**됐다.

렌더를 기다리지 않는 **동기 가드**를 둔다. `disabled`는 시각 표시로만 남긴다.

```ts
const submittingRef = useRef(false);
useEffect(() => { if (!isPending) submittingRef.current = false; }, [isPending]);

const handleSubmit = (e) => {
  e.preventDefault();
  if (submittingRef.current) return;
  submittingRef.current = true;
  onSubmit(...);
};
```

### ⚠ 로그인 후 이동은 가드가 단독으로 소유한다

로그인 화면의 mutation `onSuccess`에서 이동시키면 **동작하지 않는다.**
supabase가 `signInWithPassword` 반환 **전에** `SIGNED_IN`을 발행하므로,
`status`가 바뀌는 순간 `GuestOnly`가 children을 스켈레톤으로 갈아치워 화면이 언마운트되고
`onSuccess` 콜백 자체가 실행되지 않는다(레이스가 아니라 결정적 파손).

→ 목적지 결정은 `GuestOnly` 한 곳에서만 한다. `?next=`도 거기서 읽는다.
서버 가드(proxy)도 **같은 `safeNextPath`** 를 써서 판정이 갈리지 않게 한다.

### 낙관적 업데이트

`onMutate`(취소 + 스냅샷) → `onError`(롤백) → `onSettled`(재동기화). 선례: `features/toggle-post-like`.

- **`setQueryData`가 아니라 `setQueriesData`(복수형)** — 목록 캐시가 정렬·필터별로 여러 키에 존재할 수 있다. `cancelQueries`·`getQueriesData`도 `postKeys.lists()` prefix로 일괄 처리한다.
- 목록·상세 두 캐시를 함께 갱신하고 스냅샷도 둘 다 캡처한다.
- **`onSettled`에서 응답값으로 직접 덮지 않고 무효화한다** — 연타로 뮤테이션이 겹치면 마지막 응답이 최신이라는 보장이 없다.
- 버튼을 `disabled`로 만들지 않는다. 낙관적 UI의 목적이 즉시 반응이고, 최종 정답은 `onSettled`가 확정한다.
