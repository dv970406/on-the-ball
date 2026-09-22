"use client";

import { type MatchRanking, useMatchRankingQuery } from "@/entities/match";
import { useSessionStore } from "@/entities/session";

interface UseMatchRankingArgs {
  /** 서버 프리페치 결과. `undefined`는 "프리페치 안 함", `null`은 "채점된 경기가 없다" */
  initialRanking?: MatchRanking | null;
  initialUserId?: string;
}

/**
 * 랭킹 화면의 **조회·대기 판정**을 소유한다(`useMatchList`와 같은 자리·같은 이유).
 *
 * ⚠ 세션 복원 전에는 **서버가 알려준 사용자**를 키로 쓴다 — 키가 갈리면 서버가 채운 캐시에
 *   닿지 못하고 화면이 스켈레톤으로 되돌아간다(`nextjs.md`의 "쿼리 키가 userId로 스코프된
 *   화면은 그 값도 서버가 내려줘야 한다").
 * ⚠ **프리페치의 유무를 `!== undefined`로 가른다.** `null`도 프리페치다(채점된 경기가 없다는
 *   답을 이미 받았다) — `??`나 truthy로 판정하면 비시즌에 게이트가 닫혀 스켈레톤만 남는다.
 */
export function useMatchRanking({ initialRanking, initialUserId }: UseMatchRankingArgs) {
  const sessionStatus = useSessionStore((s) => s.status);
  const storeUserId = useSessionStore((s) => s.user?.id);
  const userId = sessionStatus === "loading" ? initialUserId : storeUserId;
  const prefetched = initialRanking !== undefined;

  const { data, isPending, isPlaceholderData, error, refetch } = useMatchRankingQuery(
    userId,
    // ⚠ 프리페치가 있으면 복원을 기다리지 않는다 — 기다리면 서버가 그린 HTML을 스켈레톤이
    //   덮어 SSR이 헛일이 된다(입축구 목록에서 실측한 사고다).
    prefetched || sessionStatus !== "loading",
    /*
     * ⚠ **서버가 본 사용자의 키에만 시드한다.** `initialData`는 그 키가 처음 만들어질 때마다
     *   적용되므로, 화면을 연 채 계정이 바뀌면(다른 탭의 로그아웃 등) **새 사용자의 키에 이전
     *   사용자의 판이 fresh로** 들어간다 — 이 화면은 "내 순위 N위"를 크게 그려 그 한 프레임이
     *   그대로 남의 순위로 읽힌다. 키가 다르면 시드하지 않고 조회를 기다린다.
     */
    userId === initialUserId ? initialRanking : undefined,
  );

  return {
    ranking: data,
    isLoading: isPending || (!prefetched && sessionStatus === "loading"),
    isPlaceholderData,
    error,
    refetch,
    /** "내 순위" 줄이 비로그인·미참여를 가르는 데 쓴다(3분기 — `loading`을 비로그인으로 접지 않는다) */
    sessionStatus,
  };
}
