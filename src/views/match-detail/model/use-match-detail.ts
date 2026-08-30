"use client";

import { type Match, useMatchQuery } from "@/entities/match";
import { useSessionStore } from "@/entities/session";

interface UseMatchDetailArgs {
  matchId: number;
  initialMatch?: Match;
  initialUserId?: string;
}

/**
 * 경기 상세의 **조회·대기 판정**을 소유한다(`useSurveyDetail`과 같은 자리·같은 이유).
 */
export function useMatchDetail({ matchId, initialMatch, initialUserId }: UseMatchDetailArgs) {
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

  return {
    match: data,
    isLoading:
      isPending || (initialMatch === undefined && sessionStatus === "loading"),
    error,
    refetch,
  };
}
