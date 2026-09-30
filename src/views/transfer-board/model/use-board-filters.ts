"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import {
  parseTransferClub,
  parseTransferLeague,
  parseTransferSort,
  type TransferLeague,
  type TransferSort,
} from "@/entities/transfer";

/** 보드 필터 — 리그·정렬·구단. **URL이 소유한다**(공유 링크·뒤로가기가 필터를 잃지 않게) */
export interface BoardFilters {
  /** `null` = 전체 리그 */
  league: TransferLeague | null;
  sort: TransferSort;
  /** `null` = 전체 구단. 보드에 없는 구단이면 모델(`useTransferBoard`)이 전체로 폴백한다 */
  club: string | null;
}

/**
 * 보드 URL을 **서버를 부르지 않고** 바꾼다 — 필터·정렬은 뷰가 이미 가진 전체 목록으로 계산하므로 서버가 새로 줄 것이 없다.
 *
 * ⚠ `router.push`·`<Link>`로 되돌리지 않는다 — 동적 라우트라 클릭마다 서버 렌더 왕복을 기다린 뒤에야 화면이 바뀐다.
 * ⚠ `window.history`를 쓴다 — Next가 이 두 메서드를 감싸 라우터 상태에 반영하므로(`next/dist/client/components/app-router.js`)
 *   `useSearchParams`가 새 주소를 돌려주고, 뒤로가기·상세 왕복도 Next의 기록으로 복원된다.
 * ⚠ 지금 주소와 같으면 기록을 쌓지 않는다(`<Link>`가 같은 URL에서 그러듯).
 */
export function navigateBoard(href: string, mode: "push" | "replace" = "push") {
  if (href === window.location.pathname + window.location.search) return;
  if (mode === "push") window.history.pushState(null, "", href);
  else window.history.replaceState(null, "", href);
}

/**
 * 보드 필터 — **Next 라우터의 주소**에서 읽는다. 첫 렌더(SSR)부터 그 뒤의 모든 이동까지 소스가 하나다.
 *
 * ⚠ `useSearchParams`가 이 슬라이스의 유일한 예외다(`check:conventions`의 `SEARCH_PARAMS_ALLOWED`에 사유가 있다).
 *   브라우저 주소를 직접 구독하면(`useSyncExternalStore` + `popstate`) **Next가 직접 한 이동을 놓친다** — 필터가 걸린
 *   보드에서 탭바의 목록 링크를 누르면 Next가 캐시된 화면을 재사용해 보드가 다시 렌더되지 않고, 주소만 `/transfers`로
 *   바뀐 채 필터된 목록이 남았다(실측). Next 라우터의 주소를 읽는 공식 통로가 이 훅이다.
 * ⚠ `/transfers`가 **동적 라우트(`ƒ`)여야** 성립한다 — 그래야 서버 첫 렌더에서도 값이 있다. 라우트가 정적이 되면
 *   Suspense가 없어 빌드가 실패한다(조용히 CSR로 떨어지지 않는다). 경계를 씌워 그 실패를 덮지 않는다 — 덮는 순간 보드
 *   본문이 서버 HTML에서 사라진다.
 * ⚠ 모르는 값은 서버와 같은 파서로 폴백한다(모르는 리그·구단은 전체, 모르는 정렬은 최신). 같은 키가 여러 번 오면 첫 값이다.
 */
export function useBoardFilters(): BoardFilters {
  const searchParams = useSearchParams();
  return useMemo(
    () => ({
      league: parseTransferLeague(searchParams.get("league") ?? undefined),
      sort: parseTransferSort(searchParams.get("sort") ?? undefined),
      club: parseTransferClub(searchParams.get("club") ?? undefined),
    }),
    [searchParams],
  );
}
