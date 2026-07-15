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

## 라우트 그룹

- 탭 화면은 `app/(tabs)/`(공유 셸: 스크롤 영역 + 탭바), 풀스크린 디테일은 `app/(detail)/`(탭바 없음).

## Proxy (구 middleware)

- 세션 쿠키 갱신은 `proxy.ts`가 담당(Next 16에서 middleware → proxy로 개명).
- matcher에서 **`/api` 제외**한다. API 라우트는 handler(`withSupabase`)가 세션 검증·쿠키 리프레시를 직접 하므로, proxy까지 돌리면 요청당 auth 왕복이 2회로 중복된다.
