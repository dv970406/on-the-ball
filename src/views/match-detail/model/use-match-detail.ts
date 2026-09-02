"use client";

import {
  type Match,
  type MatchEvent,
  type MatchLineup,
  type MatchStat,
  buildPlayerMarks,
  useMatchEventsQuery,
  useMatchLineupQuery,
  useMatchQuery,
  useMatchStatsQuery,
} from "@/entities/match";
import { useSessionStore } from "@/entities/session";

interface UseMatchDetailArgs {
  matchId: number;
  initialMatch?: Match;
  initialUserId?: string;
  /** 서버가 미리 조회한 확정 라인업 — `undefined`면 클라이언트가 조회한다 */
  initialLineups?: MatchLineup[];
  /** 서버가 미리 조회한 득점·카드·교체 */
  initialEvents?: MatchEvent[];
  /** 서버가 미리 조회한 팀 스탯 */
  initialStats?: MatchStat[];
}

/**
 * 경기 상세의 **조회·대기 판정**을 소유한다(`useSurveyDetail`과 같은 자리·같은 이유).
 */
export function useMatchDetail({
  matchId,
  initialMatch,
  initialUserId,
  initialLineups,
  initialEvents,
  initialStats,
}: UseMatchDetailArgs) {
  const sessionStatus = useSessionStore((s) => s.status);
  const storeUserId = useSessionStore((s) => s.user?.id);
  // 세션 복원 전에는 **서버가 알려준 사용자**를 키로 쓴다 — 키가 갈리면 서버가 채운
  // 캐시에 닿지 못하고 화면이 스켈레톤으로 되돌아간다.
  const userId = sessionStatus === "loading" ? initialUserId : storeUserId;

  const { data, isPending, error, refetch } = useMatchQuery(
    matchId,
    userId,
    // ⚠ 프리페치가 있으면 복원을 기다리지 않는다 — 기다리면 서버가 그린 HTML을 스켈레톤이 덮는다
    initialMatch !== undefined || sessionStatus !== "loading",
    initialMatch,
  );

  /**
   * ⚠ **경기 조회와 같은 `enabled` 판정을 쓴다.** 라인업만 세션 복원을 기다리면 서버가 그린
   *   피치를 첫 프레임에 빈 자리가 덮는다 — 키가 userId로 스코프돼 있어서다.
   */
  const lineupQuery = useMatchLineupQuery(
    matchId,
    userId,
    initialLineups !== undefined || sessionStatus !== "loading",
    initialLineups,
  );

  const eventsQuery = useMatchEventsQuery(
    matchId,
    userId,
    initialEvents !== undefined || sessionStatus !== "loading",
    initialEvents,
  );

  /**
   * ⚠ **판정을 화면이 아니라 여기서 한 번만 한다.** 피치와 후보 명단이 같은 맵을 읽어야
   *   같은 사실이 두 모양으로 나가지 않는다(자책골처럼 드문 경우가 한쪽에서만 빠진다).
   * ⚠ `useMemo`를 두지 않는다 — 사건이 스무 건 남짓이라 매 렌더 다시 세도 무해하고,
   *   메모를 두면 의존성이 하나 더 생긴다(성급한 최적화보다 단순함).
   */
  const playerMarks = buildPlayerMarks(eventsQuery.data ?? []);

  const statsQuery = useMatchStatsQuery(
    matchId,
    userId,
    initialStats !== undefined || sessionStatus !== "loading",
    initialStats,
  );

  return {
    match: data,
    /**
     * 경기 상세의 **곁다리 세 조회를 묶음 하나로** 낸다.
     *
     * ⚠ **반환값을 여섯 개 이하로 유지하기 위한 묶음이다**(`code-quality.md`) — 한 요소에
     *   그대로 펼쳐지는 값들은 묶어서 돌려준다(`shared/ui/use-sheet-drag`의 핸들러 묶음이 선례).
     *
     * ⚠ **`undefined`와 `[]`를 접지 않는다.** `undefined`는 "아직 조회하지 않았다 / 실패했다",
     *   `[]`는 "받았는데 아직 없다"로 **뜻이 다르다** — SSR부터 쿼리까지 지켜 온 구분이라
     *   훅 반환 한 줄에서 접으면 나중에 "기록을 못 불러왔어요"를 붙이려는 순간 값이 이미 없다.
     *   한때 `stats`만 `?? []`로 접혀 있었다.
     *
     * ⚠ **에러를 돌려주지 않는다.** 셋 다 곁다리라 실패해도 본문(대진·예측)을 가리지 않는
     *   편이 맞고(`nextjs.md`), 화면은 "없으면 안 그린다" 하나로 끝난다 —
     *   `StaleBanner`는 `error && data`인 자리에 쓰는 것이라 여기 해당하지 않는다.
     */
    detail: {
      lineups: lineupQuery.data,
      events: eventsQuery.data,
      stats: statsQuery.data,
      playerMarks,
    },
    isLoading:
      isPending || (initialMatch === undefined && sessionStatus === "loading"),
    error,
    refetch,
  };
}
