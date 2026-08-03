# Next.js 16 컨벤션

이 버전은 학습 데이터와 API·구조가 다를 수 있다. **코드 작성 전 `node_modules/next/dist/docs/`의 관련 가이드를 먼저 읽는다.** deprecation 주의.

## 라우팅

- 페이지(`app/**/page.tsx`)는 **view만 마운트하는 얇은 서버 컴포넌트**로 둔다. 실제 UI는 `src/views`에.
- `params`는 **Promise**다. 타입은 **`PageProps<'/posts/[id]'>` 전역 헬퍼**를 쓴다 — import가 필요 없고 `next dev`/`next build`/`next typegen`이 생성한다.
  ```tsx
  export default async function Page(props: PageProps<"/posts/[id]">) {
    const { id } = await props.params;
    return <SomeView id={id} />;
  }
  ```
  ⚠ 새 동적 라우트를 만든 직후에는 `npx next typegen`을 돌려야 타입이 생긴다.
- URL의 `[id]`는 **문자열**이다. `Number()` 후 `Number.isSafeInteger`로 검증하고, 실패하면 조회 없이 `notFound()`.
- ⚠ **`useSearchParams`는 프리렌더를 CSR로 떨어뜨린다.** `<Suspense>`로 감싸는 게 정석이지만, **경계가 children까지 감싸면 페이지 본문 전체가 빈 껍데기가 된다** — 인증 화면 3개가 실제로 그렇게 됐다(서버 HTML에 `BAILOUT_TO_CLIENT_SIDE_RENDERING`만 남았다).
  effect 안에서만 쿼리 값이 필요하다면 **`useSearchParams`를 쓰지 말고** `@/shared/lib`의 `useNextParam`처럼 `useSyncExternalStore`로 읽는다. 그러면 경계 자체가 필요 없다.
- 로그인 후 복귀 경로(`?next=`)는 **`safeNextPath`로만 검증한다**(`@/shared/config`). 직접 문자열 검사를 짜지 말 것 — 아래 오픈 리다이렉트 항목 참고.

## 에러 안전망 (파일 컨벤션)

쿼리 에러는 화면이 `EmptyState`로 처리하지만, 그 **바깥의 렌더 오류**는 파일 컨벤션이 받는다.

- `app/error.tsx` — 모든 화면의 렌더 오류. 활성화되면 화면 셸까지 대체되므로 **재시도 + "홈으로" 탈출 경로**를 함께 둔다.
- `app/global-error.tsx` — 루트 layout이 깨졌을 때의 최후 안전망. `html`·`body`와 전역 스타일을 직접 갖추고, 공용 UI 컴포넌트에 기대지 않는다.
- `app/not-found.tsx` — 없는 경로·`notFound()`.
- 재시도 prop은 Next 16 기준 **`unstable_retry`** 다(`reset`은 재조회 없이 상태만 초기화하는 특수 케이스용).

## 서버 조회 (generateMetadata·404 판정)

현재 화면은 전부 클라이언트 쿼리로 그린다. 서버에서 조회하는 곳은 `app/posts/[id]/page.tsx` 하나다 — 공유 링크의 `<title>`과 404 판정.

- `generateMetadata`와 `Page`가 같은 데이터를 쓰면 **React `cache()`로 감싸 요청당 1회**만 돌게 한다.
- **`notFound()`는 `Page`(세그먼트 렌더)에서만 효과가 있다.** `generateMetadata`에서 부르면 메타데이터 생성만 중단되고 응답은 200으로 나간다(실측 확인).
- 조회 실패와 "없음"을 구분한다 — 일시 장애로 멀쩡한 글을 404로 단정하면 안 된다.

### ⚠ 요청 API를 try/catch로 감쌀 땐 `unstable_rethrow`

`cookies()`(= `createSupabaseServerClient`)는 "이 라우트를 동적 렌더로 전환하라"는 **Next 내부 에러를 throw**해서 동작한다. `try/catch`가 이걸 삼키면 **페이지가 스켈레톤 상태로 정적 프리렌더되어 버린다**(빌드는 성공하므로 조용히 망가진다).

```ts
} catch (e) {
  unstable_rethrow(e); // next/navigation — 프레임워크 제어용 에러는 되던진다
  console.error(...);
  return { state: "unknown" };
}
```

`notFound()`·`redirect()`도 같은 방식이라 동일한 가드가 필요하다.
**빌드 로그의 `○`(정적) / `ƒ`(동적) 표기로 확인한다** — 동적이어야 할 라우트가 `○`면 가드가 삼킨 것이다.

### 서버 프리페치를 나중에 붙인다면

클라이언트 쿼리만으로 그리는 화면은 초기 HTML이 항상 스켈레톤이다. 첫 화면이 중요해지면 페이지에서 데이터를 미리 조립해 view에 `initialData`로 넘긴다.

- 프리페치는 **최적화일 뿐**이다. 실패하면 `undefined`를 넘겨 클라이언트 조회 경로로 폴백해야 한다.
- ⚠ 붙이는 순간 `formatRelativeTime`의 하이드레이션 문제가 살아난다 → `data-and-state.md` 참고.

## 라우트 그룹

- `app/(auth)/` — 비로그인 전용 화면(로그인·회원가입). layout이 `<GuestOnly>`로 감싼다.
- ⚠ `/reset-password`는 **일부러 이 그룹 밖**에 둔다. 재설정 링크는 세션을 확립한 뒤 도달하므로 `GuestOnly` 아래면 곧바로 튕겨나가 흐름이 깨진다.
- ⚠ `/forget-password`도 그룹 밖이다. 안에 있었을 때 **로그인한 사용자가 비밀번호를 바꿀 방법이 아예 없었다** — `/reset-password`는 복구 링크로만 열리는데 그 링크를 요청하는 화면에 진입조차 못 했다. proxy의 `GUEST_ONLY`에서도 함께 빼야 판정이 갈리지 않는다.

## 메타데이터

- 접미사는 루트 layout의 **`title.template`** 이 단일 소스다(`"%s · 온더볼"`). 각 page는 자기 제목만 적는다.
- ⚠ **`title`만 채우면 링크 프리뷰는 달라지지 않는다.** 카카오톡·슬랙 등은 `og:title`/`og:description`을 먼저 읽으므로, 상세에 og를 안 넣었더니 **모든 글의 공유 프리뷰가 루트 설명 하나로 똑같았다**(공유 버튼이 있는 화면이라 실사용 경로다).
- 제목·본문 요약은 **길이를 클램프**해서 넣는다(120자 제목이 `<title>`에 그대로 들어갔다).
- 로그인 필수 화면(`/posts/new`·`/posts/[id]/edit`)은 `robots: { index: false }`. 본문이 스켈레톤뿐인 페이지가 정적 프리렌더되어 색인될 수 있다.
- `global-error.tsx`에서는 `metadata`가 동작하지 않는다 — React `<title>`을 직접 쓴다(Next 16 문서 명시).

## 같은 리소스는 라우트마다 **같은 판정**을 내려야 한다

`/posts/[id]`는 없는 글에 404를 주는데 `/posts/[id]/edit`는 `parsePostId` 실패만 보고 있어서
**없는 글·삭제된 글의 수정 URL이 200을 반환했다**(실측). 클라이언트가 화면에서 안내하더라도
HTTP 상태가 200이면 색인·공유에서 정상 페이지로 취급된다.
→ 수정 페이지도 서버에서 존재를 확인하고 `notFound()`한다. 요청 API를 try/catch로 감쌌으니
  `unstable_rethrow`도 함께 간다(안 그러면 조용히 정적 프리렌더된다).

## Proxy (구 middleware)

- 세션 쿠키 갱신 + **낙관적 라우트 가드**를 `proxy.ts`가 담당한다(Next 16에서 middleware → proxy로 개명).
- Next 공식 authentication 가이드가 권하는 구조다 — proxy는 낙관적 체크만 하고 **진짜 방어는 데이터 소스에 가장 가까운 곳(DB의 RLS)** 에서 한다. 이미 매 요청 돌던 `getUser()` 결과를 재사용하므로 추가 비용이 없다.
- **3중 방어**: proxy(하드 내비게이션·직접 URL) → `AuthRequired`/`GuestOnly`(SPA 전이·세션 만료) → **RLS(최종)**.
- **matcher는 빌드타임에 정적 분석되므로 상수여야 한다** → 경로별 분기는 함수 안에서 한다.
- ⚠ **proxy와 페이지가 같은 파서를 써야 한다.** proxy가 `\d+` 정규식, 페이지가 `Number(id)`로
  판정했더니 `Number()`가 받아들이는 `1e3`·`0x10`·`1.0`에서 판정이 갈려 **가드가 그냥 뚫렸다**.
  지금은 양쪽 다 `@/shared/lib/post-id`의 `parsePostId`(엄격한 십진수)를 쓴다.
  덤으로 `/posts/2`·`/posts/002`·`/posts/2.0` 별칭 URL도 사라졌다.
- ⚠ **경로 비교 전에 `decodeURIComponent`** 한다. Next는 퍼센트 인코딩을 디코딩해 라우팅하므로
  원문과 비교하면 `/posts/%6Eew`(= `/posts/new`)가 가드를 통과한다(실측 확인).
- ⚠ **`?next=` 오픈 리다이렉트는 두 번 뚫렸다.** 반드시 `safeNextPath`를 쓰고 직접 짜지 않는다.
  1차: 문자열 prefix 검사(`startsWith("/") && !startsWith("//")`)는 `/\evil.com`을 통과시킨다 —
     WHATWG 파서가 http(s)에서 역슬래시를 슬래시로 취급하기 때문.
  2차: `new URL(next, origin).origin === origin`만으로도 부족하다 — 파서가 `/..`을 정규화하며
     `//evil.com`을 **pathname으로** 남기고, 그 문자열을 다시 해석하면 프로토콜 상대 URL이 된다.
  → **파싱 결과로 만든 반환값을 같은 기준으로 한 번 더 대조**해야 닫힌다.
- 브라우저 세션이 **쿠키**에 있어야 proxy가 읽을 수 있다. `@supabase/ssr`의 `createBrowserClient`를 `@supabase/supabase-js`의 `createClient`(localStorage)로 바꾸면 서버 가드가 통째로 무력화된다.
- `<Link>`가 뷰포트에 들어오면 **프리페치 요청도 proxy를 탄다** → 비로그인 상태에서 `/posts/new` 링크가 307을 받는다. 기능은 정상이고 로그만 시끄럽다. 문제가 되면 matcher에 `missing: [{ type: "header", key: "next-router-prefetch" }]`를 적용한다(초기에는 넣지 않는다).
