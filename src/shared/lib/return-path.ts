/**
 * 로그인 뒤 돌아올 주소를 화면이 직접 정할 때 그 값을 다는 속성 — 보통은 지금 주소(경로 + 쿼리)가 곧 돌아올 주소다.
 *
 * 화면이 그대로인데 주소가 다른 화면을 가리키는 자리가 있다 — 이적 보드는 넓은 화면에서 딜을 고르면 주소가 그 딜의 상세
 * 경로가 된다(화면은 보드다). 그 주소로 돌아오면 보드가 아니라 상세가 뜨므로, 보드가 돌아올 주소를 이 속성에 단다.
 * 상단 바의 "로그인"(`SignInLink`)과 `next`를 받지 않은 로그인 안내(`SignInDialog`)는 화면 아래 계층을 모르므로 DOM에서 읽는다.
 */
export const RETURN_PATH_ATTR = "data-return-path";

/**
 * 로그인 뒤 돌아올 주소 — 화면이 단 값(`RETURN_PATH_ATTR`)이 있으면 그것, 없으면 지금 주소(경로 + 쿼리).
 * ⚠ 브라우저에서 **누르는 순간에만** 부른다(렌더 중에 부르면 서버 HTML과 갈린다).
 */
export function currentReturnPath(): string {
  const marked = document.querySelector(`[${RETURN_PATH_ATTR}]`)?.getAttribute(RETURN_PATH_ATTR);
  return marked || `${window.location.pathname}${window.location.search}`;
}
