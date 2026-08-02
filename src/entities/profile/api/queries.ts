"use client";

import { useQuery } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import type { MyProfile } from "../model/types";

export const profileKeys = {
  all: ["profile"] as const,
  detail: (userId: string) => [...profileKeys.all, userId] as const,
} as const;

/**
 * 유저의 프로필(닉네임).
 *
 * ⚠ 세션에서 userId를 직접 읽지 않고 **인자로 받는다** — entities끼리는 import할 수 없다
 *   (FSD 단방향 규칙). 세션을 아는 상위 레이어(widgets/views)가 넘겨준다.
 *
 * 가입 트리거가 보장 생성하므로 로그인 상태면 반드시 존재한다.
 * 닉네임은 클라이언트가 바꿀 수 없어(권한 회수) 자주 변하지 않으므로 staleTime을 길게 잡는다.
 */
export function useProfileQuery(userId: string | undefined) {
  return useQuery({
    queryKey: profileKeys.detail(userId ?? ""),
    queryFn: async (): Promise<MyProfile | null> => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nickname")
        .eq("id", userId!)
        .maybeSingle();

      if (error) {
        console.error("[profile] 프로필 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return data;
    },
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });
}
