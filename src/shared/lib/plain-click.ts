/**
 * 앱이 가로채도 되는 **일반 클릭**인가 — 수정 키(새 탭·새 창)와 가운데 버튼은 브라우저에 맡긴다(`nextjs.md` 필터 절).
 * 조건 하나만 빠져도 그 링크의 새 탭 열기가 조용히 깨진다. React·DOM 이벤트를 모두 받는다.
 */
export function isPlainClick(e: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
