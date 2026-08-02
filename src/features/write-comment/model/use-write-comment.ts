"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { commentKeys } from "@/entities/comment";
import { postKeys } from "@/entities/post";
import { useSessionStore } from "@/entities/session";

/** DB의 char_length check와 맞춘다 */
export const COMMENT_MAX = 1000;

/**
 * 댓글 작성.
 *
 * post.comment_count는 클라이언트가 건드리지 않는다 — DB 트리거가 올린다.
 * 그래서 성공 후 댓글 목록과 함께 글 캐시도 무효화해야 카운트가 화면에 반영된다.
 */
export function useWriteComment(postId: number) {
  const queryClient = useQueryClient();
  const user = useSessionStore((s) => s.user);

  return useMutation({
    mutationFn: async (content: string) => {
      const supabase = requireBrowserSupabase();
      if (!user) throw new Error("로그인이 필요해요.");

      const { error } = await supabase
        .from("comment")
        .insert({ post_id: postId, user_id: user.id, content });

      if (error) {
        console.error("[comment] 작성 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    // 무효화 Promise를 반환해 리페치 완료까지 isPending을 유지한다 →
    // 입력창이 비워지기 전에 다시 눌러 중복 등록되는 레이스를 막는다
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: commentKeys.list(postId) }),
        queryClient.invalidateQueries({ queryKey: postKeys.detail(postId) }),
        queryClient.invalidateQueries({ queryKey: postKeys.lists() }),
      ]),
  });
}
