"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch, ensureAnonymousSession } from "@/shared/api";
import { pollQueryKeys, type CastVoteResult } from "@/entities/poll";
import { userQueryKeys } from "@/entities/user";

/**
 * 투표하기 뮤테이션 — mutate(optionId).
 * 실패 시 error는 ApiError — error.message가 사용자 노출용 한국어 메시지
 * (예: "마감된 투표예요.", "이미 던진 표는 바꿀 수 없어요.")라 그대로 토스트에 쓸 수 있다.
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
      // 득표·내 표가 바뀌므로 디테일 + 모든 리스트, 활동 통계(투표수)로 유저도 무효화.
      // 리페치가 끝날 때까지 isPending을 유지해(Promise 반환) "성공했지만 화면은 미투표"인
      // 틈에 타 옵션을 탭해 VOTE_LOCKED 에러를 보는 레이스를 막는다.
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: pollQueryKeys.detail(pollId) }),
        queryClient.invalidateQueries({ queryKey: pollQueryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: userQueryKeys.all }),
      ]);
    },
    onError: (error) => {
      // 409(마감·표 확정)는 캐시가 서버와 어긋났다는 신호 — 다시 받아 화면이
      // 서버 기준(리빌/비활성)으로 스스로 복귀하게 한다.
      // 리스트까지 무효화하는 건 TMI 덱이 detail이 아니라 list 쿼리를 보기 때문.
      if (error instanceof ApiError && error.status === 409) {
        queryClient.invalidateQueries({ queryKey: pollQueryKeys.detail(pollId) });
        queryClient.invalidateQueries({ queryKey: pollQueryKeys.lists() });
      }
    },
  });
}
