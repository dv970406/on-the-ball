"use client";

import { useMemo } from "react";
import { serverToClientTime } from "@/shared/lib";
import { useSessionStore } from "@/entities/session";
import {
  TRANSFER_DEAL_LIMIT,
  type TransferClub,
  type TransferDealListItem,
  splitClubDeals,
  useTransferClubListQuery,
  useTransferDealListQuery,
  withoutWatches,
} from "@/entities/transfer";

interface UseClubBoardArgs {
  code: string;
  initialClubs?: TransferClub[];
  initialDeals?: TransferDealListItem[];
  initialUserId?: string;
  scopeStartIso: string;
  /** 서버가 데이터를 읽은 시각 — 뒤로가기가 되살린 옛 페이로드를 stale로 보게 한다 */
  serverNowMs?: number;
}

/**
 * 구단 화면의 조회와 구역 나누기.
 *
 * 딜 목록은 **보드와 같은 조회·같은 키**다(`transferKeys.list(userId, scopeStartIso)`) — 범위 안 딜 전부를 받아 이 화면이 그 구단의
 * 딜만 고른다. 그래서 보드 ↔ 구단 화면을 오가도 목록을 다시 받지 않는다. 보드와 같은 이유로 구단을 쿼리 키에 넣지 않는다
 * (필터가 키에 들어가면 `initialData`가 캐시에 닿지 못한다 — `transferKeys` 주석).
 * ⚠ 세션 규약도 보드(`useTransferBoard`)와 같다 — 복원 전에는 서버가 본 사용자로 키를 잡고, 서버가 다른 사용자로 그린 목록은
 *   관심 표시를 지운 사본을 자리 표시로만 쓴다(`nextjs.md` 서버 프리페치 절). 두 화면뿐이라 공용 훅으로 묶지 않는다
 *   (`code-quality.md` — 보드는 응원 구단·필터까지 같은 훅에서 얽혀 형태가 같지 않다).
 * ⚠ 구단 목록은 "나"와 무관하다 — 서버가 익명으로 받은 것을 그대로 넣는다.
 */
export function useClubBoard({
  code,
  initialClubs,
  initialDeals,
  initialUserId,
  scopeStartIso,
  serverNowMs,
}: UseClubBoardArgs) {
  const sessionStatus = useSessionStore((s) => s.status);
  const storeUserId = useSessionStore((s) => s.user?.id);
  const userId = sessionStatus === "loading" ? initialUserId : storeUserId;
  const initialDataUpdatedAt = () => (serverNowMs === undefined ? undefined : serverToClientTime(serverNowMs));

  const clubsQuery = useTransferClubListQuery({ initialData: initialClubs, initialDataUpdatedAt });

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
    initialDataUpdatedAt,
    placeholderData: dealsPlaceholder,
  });

  const club = clubsQuery.data?.find((c) => c.code === code) ?? null;
  // 같은 리그의 다른 구단 — 구단 화면끼리 잇는 링크(크롤러가 구단 화면을 찾는 길이기도 하다)
  const league = club?.league ?? null;
  const leagueClubs = useMemo(
    () => (league ? (clubsQuery.data ?? []).filter((c) => c.league === league && c.code !== code) : []),
    [clubsQuery.data, league, code],
  );
  const groups = useMemo(
    () => (dealsQuery.data ? splitClubDeals(dealsQuery.data, code) : undefined),
    [dealsQuery.data, code],
  );

  return {
    clubs: {
      club,
      leagueClubs,
      isLoading: clubsQuery.isPending,
      error: clubsQuery.data ? null : clubsQuery.error,
      refetch: clubsQuery.refetch,
    },
    deals: {
      groups,
      isLoading: dealsQuery.isPending || (initialDeals === undefined && sessionStatus === "loading"),
      isPlaceholderData: dealsQuery.isPlaceholderData,
      error: dealsQuery.error,
      hasData: dealsQuery.data !== undefined,
      /** 보드 목록이 상한에 닿았는가 — 판정은 응답 길이만으로 한다(보드의 잘림 안내와 같은 조건) */
      truncated: (dealsQuery.data?.length ?? 0) >= TRANSFER_DEAL_LIMIT,
      refetch: dealsQuery.refetch,
    },
  };
}
