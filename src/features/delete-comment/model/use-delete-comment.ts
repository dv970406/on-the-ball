"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { useToast } from "@/shared/lib";
import { commentKeys } from "@/entities/comment";
import { postKeys } from "@/entities/post";

/**
 * 댓글 삭제 — 게시글과 달리 hard delete다.
 * (댓글은 복구 요구가 없고, 남기면 comment_count 계산이 복잡해진다)
 */
export function useDeleteComment(postId: number) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (commentId: number) => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .from("comment")
        .delete()
        .eq("id", commentId)
        .select("id");

      if (error) {
        console.error("[comment] 삭제 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      // RLS 위반은 0행으로 조용히 지나간다 — 확인해서 에러로 승격한다
      if (data.length === 0) throw new Error("삭제 권한이 없어요.");
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: commentKeys.list(postId) }),
        queryClient.invalidateQueries({ queryKey: postKeys.detail(postId) }),
        queryClient.invalidateQueries({ queryKey: postKeys.lists() }),
      ]),
    // 실패를 앱의 유일한 알림 채널로 — 화면 문구는 조건부 평문이라 스크린리더에 닿지 않는다
    onError: (error) => toast(error.message),
  });
}
