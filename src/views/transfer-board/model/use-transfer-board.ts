"use client";

import { useMemo } from "react";
import { serverToClientTime } from "@/shared/lib";
import { useSessionStore } from "@/entities/session";
import {
  dealHasClub,
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
  withoutWatches,
} from "@/entities/transfer";

interface UseTransferBoardArgs {
  initialDeals?: TransferDealListItem[];
  initialUserId?: string;
  scopeStartIso: string;
  league: TransferLeague | null;
  sort: TransferSort;
  /** 구단 필터(코드) — URL이 소유한다. 보드에 없는 구단이면 전체로 폴백한다 */
  club: string | null;
  /** `serverNowMs ?? useNowMs()` — 순서는 뷰가 지킨다. `null`이면 캐러셀 판정을 미룬다 */
  nowMs: number | null;
  /** 서버가 그 목록을 읽은 시각 — 뒤로가기가 되살린 옛 페이로드를 stale로 보게 한다 */
  serverNowMs?: number;
}

/** 구단 필터 칩 하나 — 그 구단이 출발·행선지로 걸린 딜 수 순 */
export interface ClubOption {
  code: string;
  label: string;
  count: number;
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
 * 이적 보드의 **조회·대기 판정과 파생 계산**을 소유한다.
 *
 * ⚠ 리그·정렬·구단은 **여기서** 계산한다 — 쿼리 키에 넣지 않는다. 서버가 범위 안 딜 전체를 내리고
 *   뷰가 같은 데이터로 필터·정렬한다(사유는 `transferKeys` 주석 — 필터 객체가 키와 어긋나면
 *   `initialData`가 캐시에 닿지 못한다).
 * ⚠ 캐러셀은 리그 필터 **밖**이다 — "무엇이 새로 왔는가"라 필터를 타지 않는다.
 */
export function useTransferBoard({
  initialDeals,
  initialUserId,
  scopeStartIso,
  league,
  sort,
  club,
  nowMs,
  serverNowMs,
}: UseTransferBoardArgs) {
  const sessionStatus = useSessionStore((s) => s.status);
  const storeUserId = useSessionStore((s) => s.user?.id);
  // 세션 복원 전에는 **서버가 알려준 사용자**를 키로 쓴다 — 키가 갈리면 서버가 채운
  // 캐시에 닿지 못하고 화면이 스켈레톤으로 되돌아간다.
  const userId = sessionStatus === "loading" ? initialUserId : storeUserId;

  /**
   * ⚠ **서버가 본 사용자와 지금 사용자가 다르면 서버 목록을 캐시에 넣지 않는다.** 행마다 관심 표시가
   *   붙는 목록이라, 보드를 연 채 로그아웃(다른 탭·세션 부정)하면 새 키(비로그인)에 이전 사용자의
   *   관심 표시가 "신선한" 데이터로 앉는다 — 그때는 관심을 지운 사본을 자리 표시로만 쓰고 새로 받는다
   *   (`nextjs.md` 서버 프리페치 절 · 상세 댓글의 `ownsPrefetch`와 같은 규약).
   */
  const ownsPrefetch = userId === initialUserId;
  const dealsPlaceholder = useMemo(
    () => (!ownsPrefetch && initialDeals ? withoutWatches(initialDeals) : undefined),
    [ownsPrefetch, initialDeals],
  );
  const dealsQuery = useTransferDealListQuery({
    userId,
    scopeStartIso,
    // ⚠ 프리페치가 있으면 복원을 기다리지 않는다 — 기다리면 서버가 그린 HTML을 스켈레톤이 덮는다
    enabled: initialDeals !== undefined || sessionStatus !== "loading",
    initialData: ownsPrefetch ? initialDeals : undefined,
    // 서버 시각을 기기 시계로 옮겨 넣는다 — 기기 시계와 빼서 신선도를 재기 때문이다(`serverToClientTime`)
    initialDataUpdatedAt: () =>
      serverNowMs === undefined ? undefined : serverToClientTime(serverNowMs),
    placeholderData: dealsPlaceholder,
  });

  const deals = dealsQuery.data;

  const rumors = useMemo<RumorEntry[]>(() => {
    if (deals === undefined || nowMs === null) return [];
    return pickRecentRumors(deals, nowMs).flatMap((deal) =>
      deal.latestReport ? [{ deal, report: deal.latestReport }] : [],
    );
  }, [deals, nowMs]);

  /*
   * 구단 칩 — 리그 필터 안의 딜에서 출발·행선지 구단을 세어 많은 순(관심 구단만인 자리는 이름이 없어 칩이 되지 않지만
   * 필터에는 걸린다 — `dealHasClub`). URL의 구단이 여기 없으면 전체로 폴백한다(창이 지나 사라진 구단의 공유 링크).
   */
  const clubOptions = useMemo<ClubOption[]>(() => {
    const seen = new Map<string, ClubOption>();
    for (const deal of (deals ?? []).filter((d) => dealInLeague(d, league))) {
      for (const c of [deal.fromClub, deal.toClub]) {
        if (c === null) continue;
        const prev = seen.get(c.code);
        if (prev) prev.count += 1;
        else seen.set(c.code, { code: c.code, label: c.shortName, count: 1 });
      }
    }
    return [...seen.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko"));
  }, [deals, league]);
  const effectiveClub = club !== null && clubOptions.some((o) => o.code === club) ? club : null;

  // 정렬 → 리그 필터 → 구단 필터 → 분류. 순서가 규약이다(`groupDeals`는 입력 순서를 그대로 둔다)
  const groups = useMemo<BoardGroup[]>(
    () =>
      groupDeals(
        sortDeals(deals ?? [], sort).filter((deal) => dealInLeague(deal, league) && dealHasClub(deal, effectiveClub)),
      ),
    [deals, sort, league, effectiveClub],
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
    clubOptions,
    /** URL의 구단 중 보드에 실제로 있는 것 — 칩·링크가 이 값을 선택 상태로 쓴다 */
    club: effectiveClub,
  };
}
