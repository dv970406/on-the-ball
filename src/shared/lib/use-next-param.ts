"use client";

import { useSyncExternalStore } from "react";

/** URL은 내비게이션 없이 바뀌지 않으므로 구독할 것이 없다 (해제 함수만 돌려준다) */
function subscribe() {
  return () => {};
}

function getSnapshot() {
  return new URLSearchParams(window.location.search).get("next");
}

/** 서버·하이드레이션 시점에는 알 수 없다 */
function getServerSnapshot(): string | null {
  return null;
}

/**
 * 현재 URL의 `?next=` 값. 서버 렌더에서는 null이고 하이드레이션 직후 실제 값이 된다.
 *
 * ⚠ 일부러 `useSearchParams`를 쓰지 않는다. 그걸 쓰면 이 훅을 쓰는 화면의 프리렌더가
 *   CSR로 떨어져 **서버 HTML이 빈 껍데기**가 된다(인증 화면에서 실제로 겪었다).
 *   next는 링크 href를 보강하는 용도라, 하이드레이션 전 한 프레임 동안 next 없는 링크가
 *   노출되는 것은 허용 가능하다 — 그 링크도 정상 동작한다.
 *
 * 서버/클라이언트 스냅샷이 다른 값을 읽는 정석이 useSyncExternalStore다.
 * effect에서 setState하면 같은 결과지만 react-hooks/set-state-in-effect에 걸린다.
 */
export function useNextParam(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
