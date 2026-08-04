"use client";

import { useSyncExternalStore } from "react";

/** 시각은 구독할 외부 이벤트가 없다 (해제 함수만 돌려준다) */
function subscribe() {
  return () => {};
}

/**
 * ⚠ 모듈 스코프에 **한 번만** 고정한다.
 *   getSnapshot이 호출될 때마다 새 값을 돌려주면 React가 "스토어가 계속 바뀐다"고 보고
 *   무한 렌더에 빠진다(useSyncExternalStore의 계약).
 *   탭을 며칠 열어둔 세션에서 값이 늙는 대신, 라우팅·리페치와 무관하게 안정적이다 —
 *   24시간 창(HOT 판정)에는 이 정밀도로 충분하다.
 */
let mountedAtMs: number | null = null;

function getSnapshot(): number {
  mountedAtMs ??= Date.now();
  return mountedAtMs;
}

/** 서버·하이드레이션 시점에는 클라이언트 시계를 알 수 없다 */
function getServerSnapshot(): number | null {
  return null;
}

/**
 * 현재 시각(ms). 시간에 따라 달라지는 표시(HOT 배지 등)에 쓴다.
 * 서버 렌더에서는 `null`이고 하이드레이션 직후 실제 값이 된다 →
 * 호출부는 `null`인 프레임을 "아직 판정 전"으로 다룬다.
 *
 * ⚠ **렌더 중에 `Date.now()`를 직접 부르지 않기 위한 훅이다.**
 *   렌더는 순수해야 하고(react-hooks/purity가 실제로 잡는다), 시계를 렌더에서 읽으면
 *   SSR HTML과 하이드레이션 결과가 갈릴 수 있다.
 *   effect에서 setState해도 결과는 같지만 react-hooks/set-state-in-effect에 걸린다 —
 *   서버/클라이언트 스냅샷이 다른 값을 읽는 정석이 useSyncExternalStore다(useNextParam과 동형).
 */
export function useNowMs(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
