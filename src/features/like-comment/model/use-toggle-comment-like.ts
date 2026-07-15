"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ensureAnonymousSession } from "@/shared/api";
import { pollQueryKeys, type PollComment } from "@/entities/poll";

/**
 * 댓글 동감 토글 뮤테이션 — mutate(commentId).
 * 낙관적 업데이트: 캐시의 likedByMe/likes를 즉시 뒤집고, 실패 시 롤백한다.
 */
export function useToggleCommentLike(pollId: string) {
  const queryClient = useQueryClient();
  const commentsKey = pollQueryKeys.comments(pollId);

  return useMutation({
    mutationFn: async (commentId: number) => {
      await ensureAnonymousSession();
      return apiFetch<{ liked: boolean }>(`/api/comments/${commentId}/likes`, {
        method: "POST",
      });
    },
    onMutate: async (commentId) => {
      // 진행 중인 refetch가 낙관적 상태를 덮어쓰지 않도록 취소
      await queryClient.cancelQueries({ queryKey: commentsKey });
      const previous = queryClient.getQueryData<PollComment[]>(commentsKey);

      queryClient.setQueryData<PollComment[]>(commentsKey, (comments) =>
        comments?.map((comment) =>
          comment.id === commentId
            ? {
                ...comment,
                likedByMe: !comment.likedByMe,
                likes: comment.likes + (comment.likedByMe ? -1 : 1),
              }
            : comment,
        ),
      );

      return { previous };
    },
    onError: (_error, _commentId, context) => {
      // 실패 시 이전 캐시로 롤백
      if (context?.previous) queryClient.setQueryData(commentsKey, context.previous);
    },
    onSettled: () => {
      // 서버 기준 값으로 동기화
      void queryClient.invalidateQueries({ queryKey: commentsKey });
    },
  });
}
