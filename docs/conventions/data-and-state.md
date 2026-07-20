# 데이터·상태 컨벤션

## 데이터 접근

- 클라이언트 데이터는 **TanStack Query 훅**으로만 가져온다(`entities/*/api`의 `use*Query`). 컴포넌트에서 `fetch`를 직접 부르지 않는다.
- 로딩은 **Skeleton**(화면 구조 유지), 에러·빈 상태는 **EmptyState**(`ApiError.message`를 노출). 로딩 중 레이아웃이 튀지 않게 한다.
- Vercel 스킬 `client-swr-dedup`은 요청 중복 제거를 **SWR**로 예시하지만, 이 프로젝트는 동일 목적(중복 제거·캐싱)을 TanStack Query로 달성한다. **SWR API는 도입하지 않는다** — 원칙(raw fetch 금지·중복 제거)만 취하고 라이브러리는 기존 스택을 따른다.

## 하이드레이션

- 렌더 중 `Date.now()` / `new Date()` / `Math.random()` **금지**(SSR↔CSR 불일치). 날짜·마감 판정은 헬퍼로:
  - 남은 기간 표시 → `formatDday`
  - 마감 여부 판정 → `isClosed`
  - 오늘 날짜(UTC) → `todayUtc`
- 목/시드 값도 정적 상수로 둔다(렌더마다 값이 바뀌면 안 됨).
- Vercel 스킬 `rendering-hydration-suppress-warning`처럼 `suppressHydrationWarning`으로 불일치를 **덮지 않는다**. 위 규칙대로 비결정값을 렌더에 넣지 않고 헬퍼로 원천 차단하는 게 우선이다(경고 억제는 원인 은폐).

## 뮤테이션

- 쓰기 뮤테이션은 **`ensureAnonymousSession()` 선행**("세션 생성 전 뮤테이션" 레이스 방지).
- 결과가 여러 화면에 걸치면 `onSuccess`에서 관련 `queryKey`를 무효화한다.
- 성공 표시가 리페치 결과에 의존하면(예: 투표 후 "내 표" 반영), `onSuccess`에서 무효화 **Promise를 반환**해 리페치 완료까지 `isPending`을 유지 → 리페치 전 재클릭 레이스 방지.
- 에러는 `ApiError`(한국어 `message`)라 그대로 인라인·토스트로 노출 가능.
- 낙관적 업데이트는 `onMutate`(취소+스냅샷) → `onError`(롤백) → `onSettled`(재동기화) 패턴.
