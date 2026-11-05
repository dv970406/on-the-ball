/**
 * 보드 스크롤 영역의 sticky 앱바 — 스크롤 컨테이너는 `TabScrollArea`의 `<main>`이고 앱바는 그 바로 아래 `<header>`다.
 * 구간 점프와 J/K가 같은 DOM 지식을 쓴다 — 구조가 바뀌면 여기만 고친다.
 */
export function stickyBar(main: HTMLElement): HTMLElement | null {
  return main.querySelector<HTMLElement>(":scope > header");
}

export function stickyBarHeight(main: HTMLElement): number {
  return stickyBar(main)?.offsetHeight ?? 0;
}
