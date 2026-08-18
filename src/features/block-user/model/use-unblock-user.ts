"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { useToast } from "@/shared/lib";
import { useSessionStore } from "@/entities/session";
import { invalidateVisibility } from "./invalidate-visibility";

/**
 * 차단 해제 — `/profile`의 "차단한 사용자" 목록에서 부른다.
 *
 * ⚠ 차단 행에는 UPDATE 정책이 없다(행이 불변이다) → 해제는 delete다.
 */
export function useUnblockUser() {
  const queryClient = useQueryClient();
  const user = useSessionStore((s) => s.user);
  const toast = useToast();

  return useMutation({
    mutationFn: async (blockedId: string) => {
      const supabase = requireBrowserSupabase();
      if (!user) throw new Error("로그인이 필요해요.");

      const { data, error } = await supabase
        .from("user_block")
        .delete()
        .eq("blocker_id", user.id)
        .eq("blocked_id", blockedId)
        .select("blocked_id");

      if (error) {
        console.error("[block] 차단 해제 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      // DELETE의 using 절은 필터로 동작한다 — 권한이 없으면 에러 없이 0행이 지나간다.
      // 확인해서 에러로 승격해야 "해제했다"고 거짓말하지 않는다.
      if (data.length === 0) throw new Error("이미 차단이 해제되었어요.");
    },
    // ⚠ 여기서는 무효화 Promise를 **반환한다.** 화면(`/profile`)에 머무르고 낙관적 갱신이
    //   없으므로, 리페치가 끝날 때까지 isPending을 유지해야 목록이 갱신되기 전에 다시 눌러
    //   "이미 해제되었어요"를 보는 일이 없다(차단 쪽은 화면을 떠나므로 반대다).
    onSuccess: () => invalidateVisibility(queryClient),
    onError: (error) => toast(error.message),
  });
}
