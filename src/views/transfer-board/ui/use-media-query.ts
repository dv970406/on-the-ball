"use client";

import { useCallback, useSyncExternalStore } from "react";

/** 쿼리별 `MediaQueryList` — 브라우저에서만 채운다. `getSnapshot`은 렌더마다 불리므로 객체를 매번 만들지 않는다 */
const lists = new Map<string, MediaQueryList>();
function mediaList(query: string): MediaQueryList {
  let list = lists.get(query);
  if (!list) {
    list = window.matchMedia(query);
    lists.set(query, list);
  }
  return list;
}

/**
 * 미디어 쿼리가 맞는가 — **하이드레이션 뒤에만** `true`가 될 수 있다(서버 스냅샷은 늘 `false`).
 * 도메인을 모르는 순수 메커니즘이라 쓰는 컴포넌트 옆에 둔다(`code-quality.md`).
 *
 * ⚠ 서버 HTML과 첫 클라이언트 렌더는 `false`로 같다 — 하이드레이션이 깨지지 않는다. 그래서 이 값으로 **무엇을 그릴지**를
 *   가르면 그 폭의 첫 페인트가 늦는다(서버 HTML에 없다) — 보드는 판을 늘 그리고 CSS로 가리며, 이 값은 판이 조회를 열어도
 *   되는가(`active`)와 선택 표시에만 쓴다.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = mediaList(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => mediaList(query).matches,
    () => false,
  );
}
