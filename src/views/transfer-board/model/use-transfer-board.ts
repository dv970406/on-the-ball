"use client";

import { useMemo } from "react";
import { serverToClientTime } from "@/shared/lib";
import { useSessionStore } from "@/entities/session";
import {
  dealHasClub,
  dealInLeague,
  dealIsWatched,
  groupDeals,
  pickRecentRumors,
  sortDeals,
  type TransferClub,
  type TransferDealListItem,
  type TransferGroupKey,
  type TransferLeague,
  type TransferReport,
  type TransferSort,
  useFollowedClubsQuery,
  useTransferDealListQuery,
  withoutWatches,
} from "@/entities/transfer";

interface UseTransferBoardArgs {
  initialDeals?: TransferDealListItem[];
  /** 서버가 읽은 내 응원 구단 — 구단 칩의 순서를 첫 렌더부터 맞춘다. 비로그인·조회 실패면 `undefined` */
  initialFollowedClubs?: TransferClub[];
  initialUserId?: string;
  scopeStartIso: string;
  league: TransferLeague | null;
  sort: TransferSort;
  /** 구단 필터(코드) — URL이 소유한다. 보드에 없는 구단이면 전체로 폴백한다 */
  club: string | null;
  /** 관심 딜만 보는가 — URL이 소유한다(`?watch=1`) */
  watch: boolean;
  /** `serverNowMs ?? useNowMs()` — 순서는 뷰가 지킨다. `null`이면 캐러셀 판정을 미룬다 */
  nowMs: number | null;
  /** 서버가 그 목록을 읽은 시각 — 뒤로가기가 되살린 옛 페이로드를 stale로 보게 한다 */
  serverNowMs?: number;
}

/** 구단 필터 칩 하나 — 내 응원 구단이 앞, 그 뒤는 그 구단이 출발·행선지로 걸린 딜 수 순 */
export interface ClubOption {
  code: string;
  label: string;
  count: number;
  /** 내 응원 구단인가 — 칩이 맨 앞에 놓이고 표시가 붙는다 */
  followed: boolean;
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
 * ⚠ 리그·정렬·구단·관심은 **여기서** 계산한다 — 쿼리 키에 넣지 않는다. 서버가 범위 안 딜 전체를 내리고
 *   뷰가 같은 데이터로 필터·정렬한다(사유는 `transferKeys` 주석 — 필터 객체가 키와 어긋나면
 *   `initialData`가 캐시에 닿지 못한다).
 * ⚠ 캐러셀은 리그 필터 **밖**이다 — "무엇이 새로 왔는가"라 필터를 타지 않는다.
 */
export function useTransferBoard({
  initialDeals,
  initialFollowedClubs,
  initialUserId,
  scopeStartIso,
  league,
  sort,
  club,
  watch,
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

  /**
   * 내 응원 구단 — 구단 칩을 맨 앞으로 당기는 데만 쓴다(딜 목록은 거르지 않는다).
   * ⚠ 딜 목록과 **같은 규약**이다: 세션 복원 전에는 서버가 알려준 사용자로 열고, 서버가 다른 사용자로 읽은 값은
   *   캐시에 넣지 않는다(키가 userId로 스코프된다). 조회가 실패해도 보드는 그대로다 — 칩 순서가 딜 수 순으로 남을 뿐이다.
   */
  const followsQuery = useFollowedClubsQuery({
    userId,
    enabled: initialFollowedClubs !== undefined || sessionStatus !== "loading",
    initialData: ownsPrefetch ? initialFollowedClubs : undefined,
    initialDataUpdatedAt: () =>
      serverNowMs === undefined ? undefined : serverToClientTime(serverNowMs),
  });
  const followedClubs = followsQuery.data;

  const rumors = useMemo<RumorEntry[]>(() => {
    if (deals === undefined || nowMs === null) return [];
    return pickRecentRumors(deals, nowMs).flatMap((deal) =>
      deal.latestReport ? [{ deal, report: deal.latestReport }] : [],
    );
  }, [deals, nowMs]);

  /*
   * 구단 칩 — 리그 필터 안의 딜에서 출발·행선지 구단을 세어 많은 순(관심 구단만인 자리는 이름이 없어 칩이 되지 않지만
   * 필터에는 걸린다 — `dealHasClub`). URL의 구단이 여기 없으면 전체로 폴백한다(창이 지나 사라진 구단의 공유 링크).
   * ⚠ **내 응원 구단은 딜 수와 무관하게 맨 앞이다** — 팬이 보드를 열면 자기 구단 칩이 첫 자리에 있다. 다만 보드에 딜이
   *   하나도 없는 응원 구단은 칩을 만들지 않는다(누르면 빈 보드다). 출발·행선지가 아니라 관심 구단으로만 걸린 딜도
   *   "있는" 것으로 센다(아래).
   * ⚠ 관심 필터는 이 계산에 넣지 않는다 — 칩은 "보드에 어떤 구단이 있는가"이고, 관심을 켰다고 구단 칩이 사라지면
   *   켜기 전에 고른 구단을 풀 길이 없어진다.
   */
  const clubOptions = useMemo<ClubOption[]>(() => {
    const followed = new Set((followedClubs ?? []).map((c) => c.code));
    const seen = new Map<string, ClubOption>();
    for (const deal of (deals ?? []).filter((d) => dealInLeague(d, league))) {
      // ⚠ 응원 구단은 **관심 구단으로만 걸린 딜**도 센다 — 필터(`dealHasClub`)는 그 자리도 잡으므로 칩을 누르면 딜이
      //   나온다. 그 밖의 구단까지 관심 구단으로 세면 루머마다 붙는 빅클럽이 칩 레일을 채운다.
      const suitors = deal.suitors.filter((c) => followed.has(c.code));
      for (const c of [deal.fromClub, deal.toClub, ...suitors]) {
        if (c === null) continue;
        const prev = seen.get(c.code);
        if (prev) prev.count += 1;
        else seen.set(c.code, { code: c.code, label: c.shortName, count: 1, followed: followed.has(c.code) });
      }
    }
    return [...seen.values()].sort(
      (a, b) =>
        Number(b.followed) - Number(a.followed) || b.count - a.count || a.label.localeCompare(b.label, "ko"),
    );
  }, [deals, league, followedClubs]);
  const effectiveClub = club !== null && clubOptions.some((o) => o.code === club) ? club : null;

  // 정렬 → 리그 필터 → 구단 필터 → 관심 필터 → 분류. 순서가 규약이다(`groupDeals`는 입력 순서를 그대로 둔다)
  const groups = useMemo<BoardGroup[]>(
    () =>
      groupDeals(
        sortDeals(deals ?? [], sort).filter(
          (deal) =>
            dealInLeague(deal, league) && dealHasClub(deal, effectiveClub) && dealIsWatched(deal, watch),
        ),
      ),
    [deals, sort, league, effectiveClub, watch],
  );

  /** 내가 담은 딜 수(필터 무관) — 관심 필터의 빈 화면이 "담은 것이 없다"와 "조건에 안 맞는다"를 가르는 데 쓴다 */
  const watchedCount = useMemo(() => (deals ?? []).filter((d) => d.isWatched).length, [deals]);

  /**
   * 비로그인인가 — 관심 칩이 로그인 안내로 갈리고, 빈 화면 문구가 갈린다.
   *
   * ⚠ **세션 복원 전에는 서버가 본 사용자로 판정한다**(딜 목록의 키와 같은 규약). 복원 중을 "모름"으로 두고 링크로
   *   그리면, 비로그인·크롤러가 받는 서버 HTML에 `?watch=1` 앵커가 실린다 — 익명에게 늘 빈 보드인 주소를 크롤러에게
   *   링크로 건네는 셈이고, 하이드레이션 뒤에 칩이 버튼으로, 빈 화면 문구가 비로그인용으로 바뀐다.
   * ⚠ 복원이 끝나면 스토어의 값이 판정한다. 서버 조회가 실패해 `initialUserId`가 빈 로그인 사용자는 복원 전 한순간
   *   비로그인으로 그려진다 — 그 순간에 누르면 로그인 안내가 뜨지만 닫으면 그만이고, 반대 방향의 오판(비로그인에게
   *   필터가 걸리는 것)보다 싸다.
   */
  const isGuest = sessionStatus === "loading" ? initialUserId === undefined : sessionStatus === "guest";

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
    /**
     * 필터 레일·왼쪽 레일이 읽는 값 — 구단 칩 목록과 URL의 구단 중 보드에 실제로 있는 것(칩·링크가 이 값을 선택
     * 상태로 쓴다), 관심 필터의 빈 화면 문구·로그인 안내 판정
     */
    filter: { clubOptions, club: effectiveClub, watchedCount, isGuest },
    /**
     * 이 보드의 쿼리 스코프(복원 전에는 서버가 본 사용자) — 같은 스코프의 쿼리를 갖는 하위(오른쪽 딜 판)까지 흘려보낸다.
     * 판이 다른 키로 같은 딜을 찾으면 첫 렌더에 같은 데이터를 한 번 더 받는다(`nextjs.md` 서버 프리페치 절).
     */
    userId,
  };
}
