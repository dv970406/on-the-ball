"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch, ensureAnonymousSession } from "@/shared/api";
import { userQueryKeys } from "@/entities/user";
import type { MyActivity } from "./types";

// 계약 타입의 단일 정의는 ./types — 라우트와 공유하며, 기존 소비처를 위해 재노출
export type {
  ActivityProfile,
  ActivityStats,
  ActivityBadge,
  ActivityRecent,
  ActivityTrait,
  MyActivity,
} from "./types";

/** user 도메인 하위 키 — cast-vote 등의 userQueryKeys.all 무효화에 함께 걸린다 */
export const myActivityQueryKey = [...userQueryKeys.all, "activity"] as const;

/** 내 활동 조회 — 첫 진입에도 프로필이 보이도록 익명 세션을 먼저 보장한다 */
export function useMyActivityQuery() {
  return useQuery({
    queryKey: myActivityQueryKey,
    queryFn: async () => {
      await ensureAnonymousSession();
      return apiFetch<MyActivity | null>("/api/me/activity");
    },
    staleTime: 30_000,
  });
}
