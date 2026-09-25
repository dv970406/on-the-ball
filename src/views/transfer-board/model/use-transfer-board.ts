"use client";

import { useMemo } from "react";
import { useSessionStore } from "@/entities/session";
import {
  dealInLeague,
  groupDeals,
  pickRecentRumors,
  sortDeals,
  type TransferDealListItem,
  type TransferGroupKey,
  type TransferLeague,
  type TransferReport,
  type TransferSort,
  useTransferDealListQuery,
} from "@/entities/transfer";

interface UseTransferBoardArgs {
  initialDeals?: TransferDealListItem[];
  initialUserId?: string;
  scopeStartIso: string;
  league: TransferLeague | null;
  sort: TransferSort;
  /** `serverNowMs ?? useNowMs()` — 순서는 뷰가 지킨다. `null`이면 캐러셀 판정을 미룬다 */
  nowMs: number | null;
}

/** 캐러셀 한 장 — `pickRecentRumors`가 `latestReport !== null`을 보장하므로 여기서 좁혀 둔다 */
export interface RumorEntry {
  deal: TransferDealListItem;
  report: TransferReport;
}

/** 보드 구간 하나 — `groupDeals`의 반환 원소(배럴이 타입을 따로 내보내지 않아 여기서 뽑는다) */
export type BoardGroup = ReturnType<typeof groupDeals<TransferDealListItem>>[number];

/** 구간별 건수 — 리그 필터 적용 후. 빈 구간도 0으로 갖는다(구간 점프 칩이 전부 그린다) */
export type GroupCounts = Record<TransferGroupKey, number>;

/**
 * 이적 보드의 **조회·대기 판정과 파생 계산**을 소유한다(`useMatchList`와 같은 자리·같은 이유).
 *
 * ⚠ 리그·정렬은 **여기서** 계산한다 — 쿼리 키에 넣지 않는다. 서버가 범위 안 딜 전체를 내리고
 *   뷰가 같은 데이터로 필터·정렬한다(사유는 `transferKeys` 주석 — 필터 객체가 키와 어긋나면
 *   `initialData`가 캐시에 닿지 못한다).
 * ⚠ 캐러셀은 리그 필터 **밖**이다 — "무엇이 새로 왔는가"라 필터를 타지 않는다(계획서 §0-1).
 */
export function useTransferBoard({
  initialDeals,
  initialUserId,
  scopeStartIso,
  league,
  sort,
  nowMs,
}: UseTransferBoardArgs) {
  const sessionStatus = useSessionStore((s) => s.status);
  const storeUserId = useSessionStore((s) => s.user?.id);
  // 세션 복원 전에는 **서버가 알려준 사용자**를 키로 쓴다 — 키가 갈리면 서버가 채운
  // 캐시에 닿지 못하고 화면이 스켈레톤으로 되돌아간다.
  const userId = sessionStatus === "loading" ? initialUserId : storeUserId;

  const dealsQuery = useTransferDealListQuery(
    userId,
    scopeStartIso,
    // ⚠ 프리페치가 있으면 복원을 기다리지 않는다 — 기다리면 서버가 그린 HTML을 스켈레톤이 덮는다
    initialDeals !== undefined || sessionStatus !== "loading",
    initialDeals,
  );

  const deals = dealsQuery.data;

  const rumors = useMemo<RumorEntry[]>(() => {
    if (deals === undefined || nowMs === null) return [];
    return pickRecentRumors(deals, nowMs).flatMap((deal) =>
      deal.latestReport ? [{ deal, report: deal.latestReport }] : [],
    );
  }, [deals, nowMs]);

  // 정렬 → 리그 필터 → 분류. 순서가 규약이다(`groupDeals`는 입력 순서를 그대로 둔다)
  const groups = useMemo<BoardGroup[]>(
    () => groupDeals(sortDeals(deals ?? [], sort).filter((deal) => dealInLeague(deal, league))),
    [deals, sort, league],
  );

  const counts = useMemo<GroupCounts>(() => {
    // 리터럴로 적어야 구간이 늘 때 누락이 컴파일 에러로 드러난다
    const next: GroupCounts = { official: 0, hwg: 0, prog: 0, rumor: 0, dead: 0 };
    for (const group of groups) next[group.key] = group.deals.length;
    return next;
  }, [groups]);

  return {
    deals: {
      data: deals,
      isLoading:
        dealsQuery.isPending || (initialDeals === undefined && sessionStatus === "loading"),
      isPlaceholderData: dealsQuery.isPlaceholderData,
      error: dealsQuery.error,
      refetch: dealsQuery.refetch,
    },
    rumors,
    groups,
    counts,
  };
}
