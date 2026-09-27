/**
 * 서버 시각(ms) → **이 기기의 시계** 기준 시각.
 *
 * TanStack의 `initialDataUpdatedAt`처럼 기기 시계(`Date.now()`)와 뺄셈하는 자리에 서버 시각을 그대로 넣으면
 * 기기 시계 오차만큼 신선도가 틀어진다 — 시계가 빠른 기기는 방금 그린 SSR을 곧바로 stale로 보고, 느린
 * 기기는 뒤로가기가 되살린 옛 페이로드를 오차만큼 더 오래 신선하다고 본다(`data-and-state.md`의
 * "지배 변수는 기기 시계 오차"와 같은 함정).
 *
 * ⚠ 오차는 **지금까지 본 값 중 최솟값**으로 둔다. 잰 값(`Date.now() - serverMs`)에는 기기 시계 오차 말고도
 *   서버 조회·전송·하이드레이션 지연이 늘 **양수로** 더해지므로, 최솟값이 참 오차에 가장 가깝다. 뒤로가기로
 *   되살린 옛 페이로드에서 잰 값은 더 클 뿐이라 저절로 무시된다.
 * ⚠ 서버 렌더에서는 보정하지 않는다 — 모듈 변수가 서버 프로세스 전체에서 공유되고, 서버의 신선도 계산은
 *   화면에 영향이 없다.
 * ⚠ 이벤트·쿼리 옵션 함수 안에서만 부른다(렌더 본문에서 부르면 `react-hooks/purity`에 걸린다).
 */
let skewMs: number | null = null;

export function serverToClientTime(serverMs: number): number {
  if (typeof window === "undefined") return serverMs;
  const measured = Date.now() - serverMs;
  skewMs = skewMs === null ? measured : Math.min(skewMs, measured);
  return serverMs + skewMs;
}
