"use client";

import { type Survey, useSurveyQuery } from "@/entities/survey";
import { useSessionStore } from "@/entities/session";

interface UseSurveyDetailArgs {
  surveyId: number;
  initialSurvey?: Survey;
  initialUserId?: string;
}

/**
 * 서베이 상세의 **조회·대기 판정**을 소유한다.
 *
 * 목록(`use-survey-list`)과 같은 형태·같은 이유다 — 세션 상태와 서버가 내려준 prop이
 * 서로를 조건으로 삼고, 어긋나면 서버가 그린 HTML이 스켈레톤에 덮인다.
 */
export function useSurveyDetail({ surveyId, initialSurvey, initialUserId }: UseSurveyDetailArgs) {
  const sessionStatus = useSessionStore((s) => s.status);
  const storeUserId = useSessionStore((s) => s.user?.id);
  // 세션 복원 전에는 **서버가 알려준 사용자**를 키로 쓴다 — 키가 갈리면 캐시에 닿지 못한다.
  // ⚠ 쿠키가 같으니 복원 후 값도 같다. 다르면(세션 만료) 키가 바뀌며 리페치되는데,
  //   그건 서버가 부정된 상황이라 다시 받는 것이 맞다.
  const userId = sessionStatus === "loading" ? initialUserId : storeUserId;

  const { data: survey, isPending, error, refetch } = useSurveyQuery(
    surveyId,
    userId,
    // ⚠ 프리페치가 있으면 복원을 기다리지 않는다 — 기다리면 서버가 그린 HTML을
    //   스켈레톤으로 덮어 SSR이 헛일이 된다.
    initialSurvey !== undefined || sessionStatus !== "loading",
    initialSurvey,
  );

  return {
    survey,
    isLoading: isPending || (initialSurvey === undefined && sessionStatus === "loading"),
    error,
    refetch,
  };
}
