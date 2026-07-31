# Next.js 16 컨벤션

이 버전은 학습 데이터와 API·구조가 다를 수 있다. **코드 작성 전 `node_modules/next/dist/docs/`의 관련 가이드를 먼저 읽는다.** deprecation 주의.

## 라우팅

- 페이지(`app/**/page.tsx`)는 **view만 마운트하는 얇은 서버 컴포넌트**로 둔다. 실제 UI는 `src/views`에.
- `params`는 **Promise**다 → `const { id } = await params`.
  ```tsx
  export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <SomeView id={id} />;
  }
  ```
- 쿼리스트링은 `request.nextUrl.searchParams` (Route Handler) 또는 `searchParams` prop(페이지).

## 에러 안전망 (파일 컨벤션)

쿼리 에러는 화면이 `EmptyState`로 처리하지만, 그 **바깥의 렌더 오류**는 파일 컨벤션이 받는다.

- `app/error.tsx` — 모든 화면의 렌더 오류. 활성화되면 `(tabs)` 셸(탭바)까지 대체되므로 **재시도 + "홈으로" 탈출 경로**를 함께 둔다.
- `app/global-error.tsx` — 루트 layout이 깨졌을 때의 최후 안전망. `html`·`body`와 전역 스타일을 직접 갖추고, 공용 UI 컴포넌트에 기대지 않는다.
- `app/not-found.tsx` — 없는 경로·`notFound()`.
- 재시도 prop은 Next 16 기준 **`unstable_retry`** 다(`reset`은 재조회 없이 상태만 초기화하는 특수 케이스용).

## 서버 프리페치 (첫 화면을 스켈레톤 없이)

클라이언트 쿼리만으로 그리는 화면은 초기 HTML이 항상 스켈레톤이다. 첫 화면이 중요한 라우트는 **페이지(서버 컴포넌트)에서 데이터를 미리 조립해 view에 `initialData`로 넘긴다**.

- 선례: `app/(tabs)/page.tsx` → `buildHomeFeed` → `<HomeView initialFeed={...} />` → `useHomeQuery(initialFeed)`.
- 프리페치는 **최적화일 뿐**이다. 실패하면 `undefined`를 넘겨 기존 클라이언트 조회 경로로 그대로 폴백해야 한다.
- 조립 로직을 라우트 핸들러와 공유하는 방법은 `architecture.md`의 "서버 조립 모듈 seam".

### ⚠ 요청 API를 try/catch로 감쌀 땐 `unstable_rethrow`

`cookies()`(= `createSupabaseServerClient`)는 "이 라우트를 동적 렌더로 전환하라"는 **Next 내부 에러를 throw**해서 동작한다. 프리페치 실패 대비 `try/catch`가 이걸 삼키면 **페이지가 스켈레톤 상태로 정적 프리렌더되어 버린다**(빌드는 성공하므로 조용히 망가진다).

```ts
} catch (e) {
  unstable_rethrow(e); // next/navigation — 프레임워크 제어용 에러는 되던진다
  console.error(...);
  return undefined;
}
```

`notFound()`·`redirect()`도 같은 방식이라 동일한 가드가 필요하다.

## 라우트 그룹

- 탭 화면은 `app/(tabs)/`(공유 셸: 스크롤 영역 + 탭바), 풀스크린 디테일은 `app/(detail)/`(탭바 없음).

## Proxy (구 middleware)

- 세션 쿠키 갱신은 `proxy.ts`가 담당(Next 16에서 middleware → proxy로 개명).
- matcher에서 **`/api` 제외**한다. API 라우트는 handler(`withSupabase`)가 세션 검증·쿠키 리프레시를 직접 하므로, proxy까지 돌리면 요청당 auth 왕복이 2회로 중복된다.
