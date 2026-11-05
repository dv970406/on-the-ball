/**
 * 서버 프리페치의 목록 결과를 접는다 — 실패면 로그를 남기고 `undefined`(클라이언트 조회로 폴백), 성공이면 행 배열.
 *
 * ⚠ `[]`로 접지 않는다 — `[]`는 "받았는데 없다"이고 `undefined`가 "못 받았다"다(`nextjs.md` 서버 프리페치 절).
 * ⚠ 로그를 빠뜨리지 않는다 — PostgREST 에러는 던지지 않고 값으로 돌아와 `catch`에 닿지 않는다. 그대로 흘리면 크롤러가 스켈레톤을 받아도 흔적이 없다.
 *
 * 값만 다루는 순수 함수라 서버에서 쓰도록 직접 경로(`@/shared/api/prefetch`)로 가져간다.
 */
export function prefetchedRows<T>(label: string, result: { data: T[] | null; error: unknown }): T[] | undefined {
  if (result.error) {
    console.error(`${label} 실패:`, result.error);
    return undefined;
  }
  return result.data ?? [];
}
