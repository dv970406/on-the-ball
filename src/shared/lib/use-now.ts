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
 *
 * ⚠ **그래서 서버 시각이 있으면 그쪽이 우선이다** — `serverNowMs ?? useNowMs()` 순서다.
 *   이 값은 "지금"이 아니라 "이 세션이 처음 렌더된 순간"이라, 이동할 때마다 서버가 새로
 *   찍어 주는 값(Router Cache TTL 0)보다 늘 낡았다. 뒤집으면 마감·구역 판정이 그만큼
 *   과거에 머문다(실측 사례는 `data-and-state.md`).
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

/**
 * 조회 결과를 받은 시각을 기준 시각으로 삼는다 — **프리페치가 없는 클라이언트 전용 화면용.**
 *
 * ⚠ 규약은 `serverNowMs ?? useNowMs()`인데(`data-and-state.md`), 서버가 시각을 내려주지
 *   않는 화면에는 그 앞자리가 비어 있다. 그러면 `useNowMs()`의 세션 고정값이 유일한
 *   기준이 되어 **방금 만든 것이 과거 시계로 판정된다** — 어드민에서 "지금부터" 노출되는
 *   공지를 등록하고 목록으로 돌아오면 `예정`으로 그려졌다(실측).
 * ⚠ `dataUpdatedAt`은 TanStack Query가 그 데이터를 **받은 순간**이라 리페치마다 새로
 *   찍힌다. 등록·수정 후 무효화가 곧 리페치이므로 판정이 함께 따라온다.
 * ⚠ 데이터가 아직 없으면 `0`이다 — 그때만 세션 시계로 떨어진다.
 *   `??`가 아니라 `> 0` 비교인 이유이고, 훅은 조건 없이 먼저 부른다.
 */
export function useQueryNowMs(dataUpdatedAt: number): number | null {
  const clientNowMs = useNowMs();
  return dataUpdatedAt > 0 ? dataUpdatedAt : clientNowMs;
}
