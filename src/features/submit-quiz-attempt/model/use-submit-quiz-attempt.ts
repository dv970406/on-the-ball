"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ensureAnonymousSession } from "@/shared/api";
import { quizQueryKeys, type QuizAttemptResult } from "@/entities/quiz";
import { userQueryKeys } from "@/entities/user";

/**
 * 퀴즈 정답 제출 뮤테이션 — mutate(choiceId).
 * 실패 시 error는 ApiError — error.message가 사용자 노출용 한국어 메시지
 * (예: "이미 도전한 문제예요.", "아직 열리지 않은 문제예요.")라 그대로 노출 가능.
 */
export function useSubmitQuizAttempt(quizId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (choiceId: string) => {
      // 익명 세션 보장 후 제출 — "세션 생성 전 뮤테이션" 레이스 방지
      await ensureAnonymousSession();
      return apiFetch<QuizAttemptResult>(`/api/quizzes/${quizId}/attempts`, {
        method: "POST",
        body: JSON.stringify({ choiceId }),
      });
    },
    onSuccess: () => {
      // 선택률·내 도전 기록이 바뀌므로 퀴즈 전체 + 스트릭 갱신으로 유저도 무효화.
      // 리빌이 재조회 결과에 의존하므로 cast-vote와 동일하게 Promise를 반환해
      // 리페치 완료까지 isPending을 유지 → 리페치 전 재제출 레이스를 막는다.
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: quizQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: userQueryKeys.all }),
      ]);
    },
  });
}
