"use client";

import { useRouter } from "next/navigation";

/**
 * 뒤로가기 — 앱 밖에서 바로 진입한 경우(공유 링크·검색 유입) 이탈이 되지 않도록 폴백한다.
 *
 * ⚠ `window.history.length`는 **그 탭의 전체 히스토리 길이**라 앱 내부 이동인지까지는 알 수
 *   없다. 새 탭으로 열린 딥링크에서 1이라는 사실만 쓰는 근사이고, 그 경우가 이탈을 막아야
 *   하는 유일한 경우다.
 */
export function useBackOrFallback(fallbackHref: string) {
  const router = useRouter();

  return () => {
    if (window.history.length > 1) router.back();
    else router.replace(fallbackHref);
  };
}
