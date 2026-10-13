"use client";

import { useEffect } from "react";

/**
 * 이 탭에서 **앱 안의 이동으로 쌓인 기록이 있는가** — 뒤로가기 버튼이 `router.back()`을 써도 되는지의 판정이다.
 *
 * ⚠ `window.history.length`로 판정하지 않는다 — 그 값은 탭 전체의 기록이라, 검색 결과에서 같은 탭으로 들어온 사용자도
 *   2 이상이다. 그 값을 믿으면 화면의 뒤로가기가 사이트를 빠져나가 검색 결과로 돌아간다.
 * ⚠ 값은 **모듈 스코프**다 — 문서를 새로 받으면(새로고침·직접 진입·OAuth 복귀) 초기화되어 그 진입점이 기록의 첫 칸이 된다.
 *   SPA 이동은 모듈을 다시 읽지 않으므로 값이 남는다.
 * ⚠ 한 번 세우면 내리지 않는다 — 브라우저 뒤로가기로 첫 칸까지 돌아온 뒤 화면의 뒤로가기를 누르면 사이트를 나간다.
 *   popstate만으로는 뒤로/앞으로를 가르지 못해 칸 수를 셀 수 없다(수용한 한계 — 첫 칸에서 바로 누르는 흔한 경로는 막는다).
 */
let navigated = false;
let installed = false;

/** 클릭 핸들러에서만 읽는다 — 렌더 중에 읽으면 서버(늘 `false`)와 갈린다 */
export function hasInAppHistory(): boolean {
  return navigated;
}

/**
 * `history.pushState`가 불리면 기록이 한 칸 쌓인 것이다 — 그 호출을 센다. **늘 마운트된 자리에 한 번** 둔다(루트의 `AppProviders`).
 *
 * ⚠ 경로 변화로 세지 않는다 — `router.replace`(가드의 로그인 화면 보내기·OAuth 복귀 뒤 목적지 이동·뒤로가기 폴백)도 경로를
 *   바꾸지만 기록을 쌓지 않는다. 그것까지 세면 OAuth 복귀 화면에서 `back()`이 프로바이더 페이지로 돌아간다.
 * ⚠ Next의 `<Link>`·`router.push`도, 이적 보드의 필터(`navigateBoard`)도 결국 `window.history.pushState`를 부른다 —
 *   Next 자신이 이 메서드를 감싸 두지만 감싼 쪽을 다시 감싸도 순서와 무관하게 모든 호출이 여기를 지난다.
 */
export function useInAppNavigationTracker() {
  useEffect(() => {
    if (installed) return;
    installed = true;
    const history = window.history;
    const original = history.pushState;
    history.pushState = function pushState(...args: Parameters<History["pushState"]>) {
      navigated = true;
      return original.apply(this, args);
    };
  }, []);
}
