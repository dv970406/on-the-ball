"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ensureAnonymousSession } from "@/shared/api";
import { pollQueryKeys, type CastVoteResult } from "@/entities/poll";
import { userQueryKeys } from "@/entities/user";

/**
 * 투표하기 뮤테이션 — mutate(optionId).
 * 실패 시 error는 ApiError — error.message가 사용자 노출용 한국어 메시지
 * (예: "마감된 투표예요.", "투표 변경은 한 번만 가능해요.")라 그대로 토스트에 쓸 수 있다.
 */
export function useCastVote(pollId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (optionId: number) => {
      // 익명 세션 보장 후 투표 — "세션 생성 전 뮤테이션" 레이스 방지
      await ensureAnonymousSession();
      return apiFetch<CastVoteResult>(`/api/polls/${pollId}/votes`, {
        method: "POST",
        body: JSON.stringify({ optionId }),
      });
    },
    onSuccess: () => {
      // 득표·내 표가 바뀌므로 디테일 + 모든 리스트, 뱃지 획득 가능성으로 유저도 무효화.
      // 리페치가 끝날 때까지 isPending을 유지해(Promise 반환) "성공했지만 화면은 미투표"인
      // 틈에 재탭(취소)·타 옵션 탭(변경 소진)이 일어나는 레이스를 막는다.
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: pollQueryKeys.detail(pollId) }),
        queryClient.invalidateQueries({ queryKey: pollQueryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: userQueryKeys.all }),
      ]);
    },
  });
}
