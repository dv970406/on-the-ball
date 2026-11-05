/**
 * 사용자 비의존 데이터의 캐시 수명(초) — 서버의 익명 Data Cache(`ANON_REVALIDATE`)와 클라이언트의 TanStack `staleTime`이 **한 값**을 쓴다.
 * 둘이 갈리면 같은 목록이 캐시마다 다른 나이로 보인다(`nextjs.md` — 하나를 바꾸면 둘을 함께 바꾼다가 이 상수 하나다).
 */
export const SHARED_DATA_TTL_SECONDS = 30;
