"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ensureAnonymousSession } from "@/shared/api";
import { pollQueryKeys, type PollDetail } from "@/entities/poll";

/**
 * poll 좋아요 토글 뮤테이션 — mutate().
 * 낙관적 업데이트: 디테일 캐시의 likedByMe/likes를 즉시 뒤집고, 실패 시 롤백한다.
 * (slug는 공개 식별자 = URL/쿼리키)
 */
export function useTogglePollLike(slug: string) {
  const queryClient = useQueryClient();
  const detailKey = pollQueryKeys.detail(slug);

  return useMutation({
    mutationFn: async () => {
      await ensureAnonymousSession();
      return apiFetch<{ liked: boolean }>(`/api/polls/${slug}/likes`, {
        method: "POST",
      });
    },
    onMutate: async () => {
      // 진행 중인 refetch가 낙관적 상태를 덮어쓰지 않도록 취소
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<PollDetail>(detailKey);

      queryClient.setQueryData<PollDetail>(detailKey, (poll) =>
        poll
          ? {
              ...poll,
              likedByMe: !poll.likedByMe,
              likes: poll.likes + (poll.likedByMe ? -1 : 1),
            }
          : poll,
      );

      return { previous };
    },
    onError: (_error, _vars, context) => {
      // 실패 시 이전 캐시로 롤백
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous);
    },
    onSettled: () => {
      // 서버 기준 값으로 동기화 — 디테일 + 리스트(카드 좋아요 수)
      void queryClient.invalidateQueries({ queryKey: detailKey });
      void queryClient.invalidateQueries({ queryKey: pollQueryKeys.lists() });
    },
  });
}
