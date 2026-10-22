"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, type MouseEvent } from "react";
import { parsePostId } from "@/shared/lib";
import {
  parseTransferClub,
  parseTransferLeague,
  parseTransferSort,
  parseTransferWatch,
  type TransferLeague,
  type TransferSort,
} from "@/entities/transfer";
import { dealIdOfBoardPath } from "../lib/board-href";

/** 보드 필터 — 리그·정렬·구단·관심. **URL이 소유한다**(공유 링크·뒤로가기가 필터를 잃지 않게) */
export interface BoardFilters {
  /** `null` = 전체 리그 */
  league: TransferLeague | null;
  sort: TransferSort;
  /** `null` = 전체 구단. 보드에 없는 구단이면 모델(`useTransferBoard`)이 전체로 폴백한다 */
  club: string | null;
  /** 관심 딜만 보는가(`?watch=1`) — 비로그인이면 담은 딜이 없어 빈 목록이 된다 */
  watch: boolean;
  /**
   * 목록·상세 2분할(lg+)에서 오른쪽 판에 연 딜 — `null`이면 화면 순서상 첫 딜이다.
   * 고르면 주소가 그 딜의 상세 경로(`/transfers/<id>` — `boardDealHref`)가 된다. 로그인 복귀 주소(`next`)와 옛 공유 링크는
   * `?deal=<id>`로 온다 — 경로가 먼저이고, 둘 다 같은 값으로 읽는다.
   * ⚠ **필터가 아니다** — `boardHref`의 필터 링크는 이 값을 싣지 않는다(필터를 바꾸면 선택이 풀리고 기본값으로 간다).
   * ⚠ 해석은 `parsePostId`다 — 상세 라우트(`/transfers/[id]`)와 같은 파서여야 같은 딜이 두 주소 표기로 갈리지 않는다.
   */
  deal: number | null;
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
 * 판의 상세 링크("전체 화면"·"전체 보기")를 누르기 직전, **그 링크가 지금 주소와 같으면** 지금 기록을 하나 복제해 둔다.
 *
 * 딜을 고르면 보드의 주소가 그 딜의 상세 경로가 되므로(`boardDealHref`), 필터가 없으면 판의 상세 링크가 지금 주소와 **같다**.
 * Next는 지금 주소와 같은 곳으로 가는 이동에서 기록을 쌓지 않고 바꿔 끼운다(`app-router.js` — `canonicalUrl`이 지금 주소와
 * 같으면 `replaceState`) — 그대로 두면 보드 기록이 상세로 덮여, 상세에서 뒤로가기를 누르면 보드가 아니라 그 앞 페이지로 간다
 * (실측: 새 탭에서 연 보드였다면 빈 탭으로 갔다). 복제해 두면 Next가 그 복제본을 상세로 바꿔 끼우고 보드 기록은 남는다.
 * ⚠ Next가 감싼 `pushState`는 지금 기록의 라우터 트리를 새 기록에 옮겨 적는다 — 뒤로가기가 보드 화면으로 돌아오는 근거다.
 * ⚠ 일반 클릭만 본다 — 수정 키·가운데 버튼(새 탭)은 이 탭의 기록과 무관하다. 주소가 다르면(필터가 걸렸다) Next가 스스로 쌓는다.
 */
export function keepBoardEntryOnSameUrlLink(e: MouseEvent<HTMLElement>) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  // 더블클릭의 두 번째 클릭은 첫 클릭이 시작한 이동이 끝나기 전이라 주소가 아직 같다 — 복제가 두 번 되면 뒤로가기가 한 번 헛돈다
  if (e.detail > 1) return;
  if (!(e.target instanceof Element)) return;
  const link = e.target.closest<HTMLAnchorElement>("a[href]");
  if (!link || link.target !== "") return;
  const to = new URL(link.href);
  const here = window.location;
  if (to.origin !== here.origin || to.pathname !== here.pathname || to.search !== here.search || to.hash !== "") return;
  window.history.pushState(null, "", here.href);
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
  // ⚠ 고른 딜은 경로(`/transfers/<id>`)에도 실린다 — `usePathname`도 Next 라우터의 주소라 `useSearchParams`와 같은 이유로 쓴다
  const pathname = usePathname();
  return useMemo(() => {
    const pathDeal = dealIdOfBoardPath(pathname);
    return {
      league: parseTransferLeague(searchParams.get("league") ?? undefined),
      sort: parseTransferSort(searchParams.get("sort") ?? undefined),
      club: parseTransferClub(searchParams.get("club") ?? undefined),
      watch: parseTransferWatch(searchParams.get("watch") ?? undefined),
      deal: pathDeal ?? parsePostId(searchParams.get("deal") ?? ""),
    };
  }, [pathname, searchParams]);
}
