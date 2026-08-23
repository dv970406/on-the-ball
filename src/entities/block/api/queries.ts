"use client";

import { useQuery } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import type { BlockedUser } from "../model/types";
import { blockKeys } from "./keys";
import { BLOCKED_SELECT, buildBlockedUser } from "./mappers";

/**
 * 내가 차단한 사람 목록 — `/profile`의 "차단한 사용자" 섹션이 쓴다.
 *
 * ⚠ 세션에서 userId를 직접 읽지 않고 **인자로 받는다** — entities끼리는 import할 수 없다
 *   (FSD 단방향). 세션을 아는 상위 레이어(`views/profile`)가 넘겨준다. `useProfileQuery` 선례.
 *
 * ⚠ `.eq("blocker_id", userId)`는 방어가 아니라 **의도를 적은 것**이다. 실제 방어는
 *   `user_block_select_own` 정책이라 이 필터가 없어도 남의 차단 목록은 오지 않는다.
 */
export function useBlockedUsersQuery(userId: string | undefined) {
  return useQuery({
    queryKey: blockKeys.list(userId),
    queryFn: async (): Promise<BlockedUser[]> => {
      // ⚠ `!`를 쓰지 않는다 — 아래 `enabled`와 **다른 줄에 떨어져 있어** 한쪽만 고치면
      //   조용히 깨진다. 여기서 좁히면 그 실패가 한국어 에러로 드러난다.
      if (!userId) throw new Error("로그인이 필요해요.");
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .from("user_block")
        .select(BLOCKED_SELECT)
        .eq("blocker_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[block] 차단 목록 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return (data ?? []).map(buildBlockedUser);
    },
    enabled: !!userId,
  });
}
