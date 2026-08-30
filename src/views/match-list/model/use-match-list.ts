"use client";

import { type MatchListPage, useMatchListQuery } from "@/entities/match";
import { useSessionStore } from "@/entities/session";

interface UseMatchListArgs {
  initialMatches?: MatchListPage;
  initialUserId?: string;
}

/**
 * 경기 목록의 **조회·대기 판정**을 소유한다(`useSurveyList`와 같은 자리·같은 이유).
 *
 * ⚠ **구역 분할을 하지 않는다.** 지난/다가오는은 `buildMatchListQueries`가 조회 조건으로
 *   이미 갈라 놓는다 — 여기서 클라이언트 시계로 다시 나누면 조회 기준과 표시 기준이
 *   서로 다른 순간을 보게 되어, 낡은 시계가 킥오프한 경기를 "다가오는"으로 그린다(실측).
 *
 * ⚠ **적중률은 여기 없다.** 목록 데이터와 값을 다투지 않는 독립 관심사라 `useMatchAccuracy`가
 *   따로 갖는다(`code-quality.md`의 "반환값 여섯 개" 한도와 "관심사 하나" 기준).
 */
export function useMatchList({ initialMatches, initialUserId }: UseMatchListArgs) {
  const sessionStatus = useSessionStore((s) => s.status);
  const storeUserId = useSessionStore((s) => s.user?.id);
  // 세션 복원 전에는 **서버가 알려준 사용자**를 키로 쓴다 — 키가 갈리면 서버가 채운
  // 캐시에 닿지 못하고 화면이 스켈레톤으로 되돌아간다.
  const userId = sessionStatus === "loading" ? initialUserId : storeUserId;

  const { data, isPending, isPlaceholderData, error, refetch } = useMatchListQuery(
    userId,
    // ⚠ 프리페치가 있으면 복원을 기다리지 않는다 — 기다리면 서버가 그린 HTML을 스켈레톤이
    //   덮어 SSR이 헛일이 된다(입축구 목록에서 실측한 사고다).
    initialMatches !== undefined || sessionStatus !== "loading",
    initialMatches,
  );

  return {
    page: data,
    isLoading: isPending || (initialMatches === undefined && sessionStatus === "loading"),
    isPlaceholderData,
    error,
    refetch,
  };
}
