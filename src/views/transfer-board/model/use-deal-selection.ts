"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TransferDealListItem, TransferLeague, TransferSort } from "@/entities/transfer";
import { boardHref } from "../lib/board-href";
import type { GroupLayout } from "../lib/screen-order";
import { navigateBoard } from "./use-board-filters";

interface UseDealSelectionArgs {
  /** 보드 전체(필터 무관) — 주소의 딜이 여기 있으면 그 딜이 열린다(필터로 가린 관심 딜도 레일에서 열 수 있다) */
  deals: readonly TransferDealListItem[] | undefined;
  /** 필터·정렬·분류가 끝난 구간의 화면 배치 — 기본 선택("화면 순서상 첫 딜")이 첫 구간의 `ordered`를 본다 */
  layouts: readonly GroupLayout[];
  /** 주소의 `?deal=` — `useBoardFilters`가 `parsePostId`로 읽은 값 */
  requested: number | null;
  league: TransferLeague | null;
  sort: TransferSort;
  club: string | null;
  watch: boolean;
  /** 2분할이 실제로 서 있는가 — 주소 정리(무효한 `?deal=` 걷기)는 이 폭에서만 한다 */
  enabled: boolean;
}

/**
 * 주소에서 `deal` 파라미터만 걷은 경로 — 다른 파라미터는 **원래 표기 그대로** 둔다(`URLSearchParams`로 다시 쓰면 공백이 `+`가
 * 되어 `boardHref`가 만드는 표기와 갈린다).
 */
function withoutDealParam(pathname: string, search: string) {
  const rest = search
    .replace(/^\?/, "")
    .split("&")
    .filter((part) => part !== "" && part !== "deal" && !part.startsWith("deal="));
  return rest.length === 0 ? pathname : `${pathname}?${rest.join("&")}`;
}

/** 지금 판에 열린 딜과 그때의 필터 — 필터가 같은 동안만 그 딜을 붙든다 */
interface Held {
  id: number;
  filterKey: string;
}

/**
 * 목록·상세 2분할(lg+)의 **고른 딜**. 상태는 주소(`?deal=<id>`)가 소유한다 — 새로고침·공유 링크·뒤로가기가 선택을 잃지 않게.
 *
 * - 주소에 딜이 없거나 보드에 없는 id면 **화면 순서상 첫 딜**을 고른 것으로 본다. 이때 주소는 바꾸지 않는다
 *   (기본값에 파라미터를 붙이지 않는 필터 규약과 같다).
 * - 고르면 `replace`로 주소만 바꾼다 — 행을 훑을 때마다 뒤로가기 기록이 쌓이지 않게. 서버를 부르지 않는다(`navigateBoard`).
 * ⚠ 필터 링크(`boardHref`의 기본 인자)는 `deal`을 싣지 않는다 — 필터를 바꾸면 선택이 풀리고 기본값으로 간다.
 * ⚠ **보고 있던 딜은 필터가 그대로인 동안 붙든다**(`held`). 주소에 딜이 없을 때 기본 선택은 목록 첫 딜이라, 관심 필터에서 판의
 *   "빼기"를 누르면 낙관적 갱신이 그 딜을 목록에서 빼는 순간 판이 **다음 딜로 넘어갔다** — 방금 누른 버튼이 다른 딜의 것이 된다.
 *   그래서 지금 열린 딜이 보드(필터 무관 전체)에 남아 있으면 목록에서 빠져도 그 딜을 연다. 필터(리그·정렬·구단·관심)를 바꾸면
 *   놓는다 — 새 목록의 첫 딜로 간다. 판단 근거가 렌더마다 바뀌는 값이라 렌더 중에 갱신한다(이전 렌더의 값을 기억하는 React
 *   권장 형태 — effect로 맞추면 한 프레임 다음 딜이 그려진다).
 * ⚠ **판이 열지 못하는 `?deal=`은 주소에서 걷는다**(2분할 폭, 하이드레이션 뒤) — 없는 id(`999999`)·형식이 틀린 값(`abc`·`1e3`·
 *   `0246`·`-1` — `parsePostId`가 거부한다)이면 판은 첫 딜로 폴백하는데, 주소가 그대로면 그 주소를 공유받은 사람이 다른 딜을 본다.
 *   `replace`라 기록이 쌓이지 않고 다른 파라미터는 손대지 않는다. 서버 렌더·canonical과 무관하다(canonical은 쿼리를 싣지 않는다).
 *   모바일에서는 걷지 않는다 — 그 폭에는 "고른 딜"이 없어 주소의 값이 화면을 거짓으로 만들지 않는다.
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

  // 무효한 `?deal=` 걷기 — 주소(외부 시스템)를 맞추는 일이라 effect다
  useEffect(() => {
    if (!enabled || !deals) return;
    const { pathname, search } = window.location;
    if (!/(^\?|&)deal(=|&|$)/.test(search)) return;
    if (requested !== null && deals.some((d) => d.id === requested)) return;
    navigateBoard(withoutDealParam(pathname, search), "replace");
  }, [enabled, deals, requested]);

  const select = useCallback(
    (id: number) => navigateBoard(boardHref(league, sort, club, watch, id), "replace"),
    [league, sort, club, watch],
  );

  return { selectedDeal, select };
}
