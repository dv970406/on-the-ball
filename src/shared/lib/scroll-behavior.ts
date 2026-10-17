/**
 * 코드로 굴리는 스크롤(`scrollTo`·`scrollBy`)의 동작 — 사용자가 동작 줄이기를 켰으면 즉시(`auto`), 아니면 부드럽게.
 * CSS 쪽은 전역 블록이 처리하지만 JS가 넘기는 `behavior`는 그 블록이 닿지 않는다(`styling.md`의 `prefers-reduced-motion`).
 * ⚠ 브라우저에서만 부른다(이벤트 핸들러 · effect) — 렌더 중에 부르면 `window`가 없다.
 */
export function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
