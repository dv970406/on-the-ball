"use client";

import { useRouter } from "next/navigation";
import { hasInAppHistory } from "@/shared/lib";

/**
 * 뒤로가기 — 앱 안에서 쌓인 기록이 있을 때만 `router.back()`이고, 없으면(공유 링크·검색 유입으로 이 화면에 바로 들어왔다)
 * 폴백 경로로 `replace`한다.
 *
 * ⚠ `window.history.length`로 가르지 않는다 — 탭 전체의 기록 길이라, 검색 결과에서 **같은 탭으로** 들어온 사용자도 2 이상이고
 *   그때 `back()`은 사이트를 빠져나가 검색 결과로 돌아간다. 판정은 `hasInAppHistory`(`@/shared/lib`)가 단독으로 갖는다 —
 *   루트가 `history.pushState` 호출(= 쌓인 기록)을 센다.
 * ⚠ 폴백은 `replace`다 — 진입점 위에 칸을 쌓으면 브라우저 뒤로가기가 다시 이 화면으로 돌아온다.
 */
export function useBackOrFallback(fallbackHref: string) {
  const router = useRouter();

  return () => {
    if (hasInAppHistory()) router.back();
    else router.replace(fallbackHref);
  };
}
