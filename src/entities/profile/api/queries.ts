"use client";

import { useQuery } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import type { MyProfile } from "../model/types";
import { profileKeys } from "./keys";
import { PROFILE_SELECT, buildProfile } from "./mappers";

/**
 * 유저의 프로필(닉네임·아바타).
 *
 * ⚠ 세션에서 userId를 직접 읽지 않고 **인자로 받는다** — entities끼리는 import할 수 없다
 *   (FSD 단방향 규칙). 세션을 아는 상위 레이어(widgets/views)가 넘겨준다.
 *
 * 닉네임은 가입 시 랜덤 배정되고 본인이 프로필 화면에서 바꾼다 → 자주 변하지 않으므로
 * staleTime을 길게 잡되, 수정 훅이 성공하면 무효화한다(features/update-profile).
 */
export function useProfileQuery(userId: string | undefined) {
  return useQuery({
    queryKey: profileKeys.detail(userId ?? ""),
    queryFn: async (): Promise<MyProfile | null> => {
      // ⚠ `!`를 쓰지 않는다 — 아래 `enabled`와 **다른 줄에 떨어져 있어** 한쪽만 고치면
      //   조용히 깨진다. 여기서 좁히면 그 실패가 한국어 에러로 드러난다.
      if (!userId) throw new Error("로그인이 필요해요.");
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("[profile] 프로필 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return data ? buildProfile(data) : null;
    },
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });
}
