"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch, ensureAnonymousSession } from "@/shared/api";
import { pollQueryKeys } from "@/entities/poll";
import type { HomeFeed } from "./types";

/**
 * 홈 피드 쿼리 키 — polls 리스트 하위 키로 두어
 * 투표(cast-vote)의 pollQueryKeys.lists() 무효화에 함께 걸린다 (myVote 최신화).
 */
export const homeFeedQueryKey = [...pollQueryKeys.lists(), "home"] as const;

/** 홈 피드 조회 — myVote가 첫 로드에도 반영되도록 익명 세션을 먼저 보장한다 */
export function useHomeQuery() {
  return useQuery({
    queryKey: homeFeedQueryKey,
    queryFn: async () => {
      await ensureAnonymousSession();
      return apiFetch<HomeFeed>("/api/home");
    },
  });
}
