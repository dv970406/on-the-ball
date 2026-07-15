"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ensureAnonymousSession } from "@/shared/api";
import { pollQueryKeys, type PollComment } from "@/entities/poll";

/**
 * "한 줄 거들기" 댓글 작성 뮤테이션 — mutate(body).
 * 투표 전 작성 시 403 "투표한 뒤에 댓글을 남길 수 있어요." (ApiError.message 그대로 노출 가능)
 */
export function useWriteComment(pollId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: string) => {
      await ensureAnonymousSession();
      return apiFetch<PollComment>(`/api/polls/${pollId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
    },
    onSuccess: () => {
      // 댓글 목록 + 디테일(commentCount) 갱신
      void queryClient.invalidateQueries({ queryKey: pollQueryKeys.comments(pollId) });
      void queryClient.invalidateQueries({ queryKey: pollQueryKeys.detail(pollId) });
    },
  });
}
