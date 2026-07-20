"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDelayedReveal } from "@/shared/lib";
import { ApiError } from "@/shared/api";
import {
  quizQueryKeys,
  useQuizDetailQuery,
  type QuizAttemptResult,
} from "@/entities/quiz";
import { useSubmitQuizAttempt } from "@/features/submit-quiz-attempt";

/**
 * 퀴즈 도전 상태머신 — quiz-detail-view의 로직을 담당한다(뷰는 렌더만).
 * "이번 세션 제출(fresh)"과 "재방문(myAttempt)"을 하나의 파생값으로 통합해 노출한다.
 */
export function useQuizAttempt(id: string) {
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuizDetailQuery(id);
  const submit = useSubmitQuizAttempt(id);
  const { revealed, trigger, reset } = useDelayedReveal(380);

  /** 이번 세션에서 내가 고른 보기 — null이면 아직 미도전(또는 재방문) */
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<QuizAttemptResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 이번 세션 제출이면 리빌 지연(380ms)+응답 도착까지 기다리고, 재방문이면 바로 done
  const fresh = picked !== null;
  const done = fresh ? revealed && result !== null : data?.myAttempt != null;

  const myChoiceId = fresh ? picked : (data?.myAttempt?.choiceId ?? null);
  const isCorrect = fresh
    ? (result?.isCorrect ?? false)
    : (data?.myAttempt?.isCorrect ?? false);
  const correctChoiceId = fresh
    ? (result?.correctChoiceId ?? null)
    : (data?.myAttempt?.correctChoiceId ?? null);

  // 선택률: 제출 직후엔 내 픽이 반영된 최신값(result.choices), 그 외엔 디테일 값
  const displayChoices =
    fresh && result && result.choices.length > 0
      ? result.choices
      : (data?.choices ?? []);

  // 정답 명기 — answer_text가 없는 문제(지난 시드 등)는 정답 보기로 대체
  const correctChoice =
    displayChoices.find((choice) => choice.id === correctChoiceId) ?? null;
  const answerTextRaw = fresh ? result?.answerText : data?.myAttempt?.answerText;
  const answerText =
    answerTextRaw ??
    (correctChoice
      ? `${correctChoice.team}${correctChoice.season ? ` · ${correctChoice.season}` : ""}`
      : "");

  const handlePick = (choiceId: number) => {
    if (done || picked !== null || submit.isPending) return;
    setSubmitError(null);
    setPicked(choiceId);
    trigger();
    submit.mutate(choiceId, {
      onSuccess: (res) => setResult(res),
      onError: (e) => {
        reset();
        setPicked(null);
        setSubmitError(e instanceof Error ? e.message : "정답 제출에 실패했어요.");
        // 이미 도전한 문제(다른 탭 제출 등)면 재조회로 done 상태 동기화
        if (e instanceof ApiError && e.status === 409) {
          void queryClient.invalidateQueries({ queryKey: quizQueryKeys.detail(id) });
        }
      },
    });
  };

  return {
    data,
    isPending,
    isError,
    error,
    fresh,
    done,
    result,
    myChoiceId,
    isCorrect,
    correctChoiceId,
    displayChoices,
    answerText,
    submitError,
    handlePick,
  };
}
