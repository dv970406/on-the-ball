"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ROUTES } from "@/shared/config";
import { parsePostId } from "@/shared/lib";
import type { TransferDealListItem, TransferLeague, TransferSort } from "@/entities/transfer";
import { boardDealHref, dealIdOfBoardPath } from "../lib/board-href";
import { SPLIT_QUERY } from "../ui/use-deal-select";
import type { GroupLayout } from "../lib/screen-order";
import { navigateBoard } from "./use-board-filters";

interface UseDealSelectionArgs {
  /** 보드 전체(필터 무관) — 주소의 딜이 여기 있으면 그 딜이 열린다(필터로 가린 관심 딜도 레일에서 열 수 있다) */
  deals: readonly TransferDealListItem[] | undefined;
  /** 필터·정렬·분류가 끝난 구간의 화면 배치 — 기본 선택("화면 순서상 첫 딜")이 첫 구간의 `ordered`를 본다 */
  layouts: readonly GroupLayout[];
  /** 주소의 고른 딜(상세 경로 또는 `?deal=`) — `useBoardFilters`가 `parsePostId`로 읽은 값 */
  requested: number | null;
  league: TransferLeague | null;
  sort: TransferSort;
  club: string | null;
  watch: boolean;
  /** 2분할이 실제로 서 있는가 — 주소 정리(아래 effect)가 이 값으로 갈린다 */
  enabled: boolean;
}

/**
 * 쿼리에서 `deal` 파라미터만 걷은 것(`?…` 또는 빈 문자열) — 다른 파라미터는 **원래 표기 그대로** 둔다(`URLSearchParams`로 다시
 * 쓰면 공백이 `+`가 되어 `boardHref`가 만드는 표기와 갈린다).
 */
function withoutDealParam(search: string) {
  const rest = search
    .replace(/^\?/, "")
    .split("&")
    .filter((part) => part !== "" && part !== "deal" && !part.startsWith("deal="));
  return rest.length === 0 ? "" : `?${rest.join("&")}`;
}

/**
 * 보드의 첫 마운트를 이 문서에서 이미 봤는가 — **문서당 한 번**이다(모듈 스코프). 좁은 화면의 `?deal=` 진입(아래)은 공유 링크로
 * 문서를 처음 연 경우만 상세로 보낸다 — 창을 좁혀 생긴 `?deal=`로 화면 안에서 다시 돌아온 보드까지 상세로 튕기지 않게.
 */
let firstBoardMountSeen = false;

/** 지금 판에 열린 딜과 그때의 필터 — 필터가 같은 동안만 그 딜을 붙든다 */
interface Held {
  id: number;
  filterKey: string;
}

/**
 * 목록·상세 2분할(lg+)의 **고른 딜**. 상태는 주소가 소유한다 — 고르면 주소가 **그 딜의 상세 경로**(`/transfers/<id>` + 필터 —
 * `boardDealHref`)가 된다. 주소창을 복사해 공유하면 받는 사람이 그 딜의 상세를 받고, 새로고침하면 상세가 뜬다.
 *
 * - 주소에 딜이 없거나 보드에 없는 id면 **화면 순서상 첫 딜**을 고른 것으로 본다. 이때 주소는 바꾸지 않는다
 *   (기본값에 파라미터를 붙이지 않는 필터 규약과 같다).
 * - 고르면 `replace`로 주소만 바꾼다 — 행을 훑을 때마다 뒤로가기 기록이 쌓이지 않게. 서버를 부르지 않는다(`navigateBoard` —
 *   Next가 `replaceState`의 경로 변경도 라우터에 반영하고, 화면은 보드 그대로다).
 * ⚠ 필터 링크(`boardHref`의 기본 인자)는 `deal`을 싣지 않는다 — 필터를 바꾸면 선택이 풀리고 기본값으로 간다.
 * ⚠ **보고 있던 딜은 필터가 그대로인 동안 붙든다**(`held`). 주소에 딜이 없을 때 기본 선택은 목록 첫 딜이라, 관심 필터에서 판의
 *   "빼기"를 누르면 낙관적 갱신이 그 딜을 목록에서 빼는 순간 판이 **다음 딜로 넘어갔다** — 방금 누른 버튼이 다른 딜의 것이 된다.
 *   그래서 지금 열린 딜이 보드(필터 무관 전체)에 남아 있으면 목록에서 빠져도 그 딜을 연다. 필터(리그·정렬·구단·관심)를 바꾸면
 *   놓는다 — 새 목록의 첫 딜로 간다. 판단 근거가 렌더마다 바뀌는 값이라 렌더 중에 갱신한다(이전 렌더의 값을 기억하는 React
 *   권장 형태 — effect로 맞추면 한 프레임 다음 딜이 그려진다).
 * ⚠ 주소 정리(아래 effect — `replace`라 기록이 쌓이지 않고 필터 파라미터는 원래 표기 그대로 둔다):
 *   - 2분할 폭에서 `?deal=`(로그인 복귀 주소·옛 공유 링크)이 판이 연 딜이면 **상세 경로로 옮겨 적는다** — 주소의 표기를 하나로 둔다.
 *   - **판이 열지 못하는 값은 걷는다**(2분할 폭) — 없는 id(`999999`)·형식이 틀린 값(`abc`·`1e3`·`0246`·`-1` — `parsePostId`가
 *     거부한다)이면 판은 첫 딜로 폴백하는데, 주소가 그대로면 그 주소를 공유받은 사람이 다른 딜을 본다.
 *   - 좁은 폭에서 상세 경로가 남아 있으면(창을 좁혔다) **보드 주소의 `?deal=`로 옮겨 적는다** — 그 폭에는 판이 없어 상세 경로는
 *     화면과 다른 것을 가리키고 탭바도 그려지지 않는다. 고른 딜은 `?deal=`로 남겨 다시 넓히면 상세 경로로 돌아온다.
 *   ⚠ 상세 경로의 보드는 하이드레이션으로 뜨는 일이 없다(그 주소를 새로 열면 상세 page가 뜬다) — 그래서 하이드레이션 첫 렌더의
 *     `enabled` = `false`가 상세 경로를 되돌리지 않는다. 화면 안 이동·뒤로가기로 마운트될 때는 첫 렌더부터 실제 폭이다.
 */
export function useDealSelection({
  deals,
  layouts,
  requested,
  league,
  sort,
  club,
  watch,
  enabled,
}: UseDealSelectionArgs) {
  const filterKey = `${league ?? ""}|${sort}|${club ?? ""}|${watch ? 1 : 0}`;
  const [held, setHeld] = useState<Held | null>(null);

  const selectedDeal = useMemo<TransferDealListItem | null>(() => {
    const find = (id: number) => deals?.find((d) => d.id === id);
    const picked = requested === null ? undefined : find(requested);
    if (picked) return picked;
    const kept = held !== null && held.filterKey === filterKey ? find(held.id) : undefined;
    if (kept) return kept;
    return layouts[0]?.ordered[0] ?? null;
  }, [deals, layouts, requested, held, filterKey]);

  const nextId = selectedDeal?.id ?? null;
  if (nextId === null ? held !== null : held?.id !== nextId || held.filterKey !== filterKey) {
    setHeld(nextId === null ? null : { id: nextId, filterKey });
  }

  // 주소 정리 — 주소(외부 시스템)를 맞추는 일이라 effect다
  useEffect(() => {
    if (!deals) return;
    const { pathname, search } = window.location;
    const pathDeal = dealIdOfBoardPath(pathname);
    if (pathDeal === null && !/(^\?|&)deal(=|&|$)/.test(search)) return;
    if (!enabled) {
      if (pathDeal !== null) {
        const rest = withoutDealParam(search);
        navigateBoard(`${ROUTES.transferList}${rest === "" ? "?" : `${rest}&`}deal=${pathDeal}`, "replace");
      }
      return;
    }
    const rest = withoutDealParam(search);
    if (requested !== null && deals.some((d) => d.id === requested)) {
      if (pathDeal === null) navigateBoard(`${ROUTES.transfer(requested)}${rest}`, "replace");
      return;
    }
    navigateBoard(`${ROUTES.transferList}${rest}`, "replace");
  }, [enabled, deals, requested]);

  /*
   * 좁은 화면에서 `?deal=`로 **문서를 처음 열면** 그 딜의 상세로 보낸다 — 그 폭에는 판이 없어 보드에 두면 링크가 가리킨 딜이
   * 화면 어디에도 없다(공유 카드는 그 딜을 보여 줬다). 공유 링크를 받는 사람은 대개 모바일이다.
   * ⚠ 폭은 `enabled`가 아니라 **지금 `matchMedia`** 로 본다 — 하이드레이션 첫 렌더의 `enabled`는 넓은 화면에서도 `false`다.
   * ⚠ `replace`다 — 들어온 보드 주소를 기록에 남기면 뒤로가기가 다시 이 보드로 와 상세로 튕긴다.
   */
  const router = useRouter();
  useEffect(() => {
    if (firstBoardMountSeen) return;
    firstBoardMountSeen = true;
    if (window.matchMedia(SPLIT_QUERY).matches) return;
    const id = parsePostId(new URLSearchParams(window.location.search).get("deal") ?? "");
    if (id !== null) router.replace(ROUTES.transfer(id));
  }, [router]);

  const select = useCallback(
    (id: number) => navigateBoard(boardDealHref(id, league, sort, club, watch), "replace"),
    [league, sort, club, watch],
  );

  return { selectedDeal, select };
}
