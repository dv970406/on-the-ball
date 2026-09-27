"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toWriteErrorMessage } from "@/shared/api";
import { useToast } from "@/shared/lib";
import { refreshCommentLists } from "@/entities/comment";

/**
 * 댓글 삭제 — hard delete다(복구 요구가 없고, 표는 cascade로 함께 사라지며 합계를 트리거가 맞춘다).
 *
 * ⚠ **루트를 지우면 딸린 남의 답글까지 cascade로 사라진다** — RLS가 막지 못하는 경로라 화면이
 *   확인 문구로 알린다(`api-and-db.md` "on delete cascade는 RLS를 적용받지 않는다").
 * ⚠ RLS 위반은 에러가 아니라 0행이다 → `.select()`로 확인해 에러로 올린다. 댓글은 공개 SELECT라
 *   `.select()`를 붙여도 쓰기가 42501이 되지 않는다.
 *   0행은 **이미 지워진 경우**(루트가 먼저 지워져 cascade로 사라진 답글 등)에도 나온다 — 권한이
 *   없는 경로는 화면에 없으므로(삭제 버튼은 내 댓글에만 붙는다) 그쪽 문구를 쓴다.
 */
export function useDeleteComment(dealId: number) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<void, Error, number>({
    mutationFn: async (commentId) => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .from("transfer_deal_comment")
        .delete()
        .eq("id", commentId)
        .select("id");

      if (error) {
        console.error("[comment] 삭제 실패:", error);
        throw new Error(await toWriteErrorMessage(supabase, error));
      }
      if (data.length === 0) throw new Error("이미 삭제된 댓글이에요.");
    },
    // ⚠ 실패해도 다시 받는다 — "이미 삭제됨"이면 목록에 남은 유령 행을 걷어내야 한다.
    //   반환해서 `mutateAsync`가 목록이 바뀐 뒤에 풀린다 → "삭제했어요" 토스트와 행이 같은 순간에 사라진다
    onSettled: () => refreshCommentLists(queryClient, dealId),
    // 실패를 앱의 유일한 알림 채널로 — 화면 문구는 조건부 평문이라 스크린리더에 닿지 않는다
    onError: (error) => toast(error.message),
  });
}
