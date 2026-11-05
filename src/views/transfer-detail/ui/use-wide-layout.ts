"use client";

import { useSyncExternalStore } from "react";
import { LG_MEDIA_QUERY } from "@/shared/config";

const subscribe = (onChange: () => void) => {
  const list = window.matchMedia(LG_MEDIA_QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
};

/**
 * 넓은 화면 배치인가 — **ARIA 역할을 폭에 맞추는 데만** 쓴다(배치는 CSS가 한다). 도메인을 모르는 메커니즘이라 쓰는 컴포넌트
 * 옆에 둔다(`code-quality.md`). 보드의 `useMediaQuery`와 같은 형태지만 views끼리는 import할 수 없어 따로 둔다.
 *
 * ⚠ 서버 스냅샷과 첫 렌더는 늘 `false`다(좁은 화면의 역할) — 하이드레이션이 갈리지 않고, 넓은 화면은 하이드레이션 직후 역할이
 *   바뀐다. CSS로는 역할을 바꿀 수 없어 이 짧은 구간을 감수한다.
 */
export function useWideLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(LG_MEDIA_QUERY).matches,
    () => false,
  );
}
