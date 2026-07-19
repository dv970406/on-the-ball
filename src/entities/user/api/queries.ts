"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api";
import type { Profile } from "../model/types";

export const userQueryKeys = {
  all: ["user"] as const,
  profile: () => [...userQueryKeys.all, "profile"] as const,
};

/** 내 프로필 조회 — 세션이 없으면 null (앱바 스트릭 칩 등에서 사용) */
export function useMyProfileQuery() {
  return useQuery({
    queryKey: userQueryKeys.profile(),
    queryFn: () => apiFetch<Profile | null>("/api/me/profile"),
    // 프로필(스트릭·팬태그)은 변동 빈도가 낮아 전역 기본(30s)보다 길게 잡는다
    staleTime: 60_000,
  });
}
