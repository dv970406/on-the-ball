"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api";
import type { QuizDetailData, QuizListData } from "../model/types";

/** quiz 도메인 쿼리 키 팩토리 — 무효화는 상위 키(all)로 한 번에 */
export const quizQueryKeys = {
  all: ["quizzes"] as const,
  list: () => [...quizQueryKeys.all, "list"] as const,
  details: () => [...quizQueryKeys.all, "detail"] as const,
  detail: (id: string) => [...quizQueryKeys.details(), id] as const,
};

/** 퀴즈 리스트 — 오늘의 문제 / 예정 / 지난 보관함 */
export function useQuizListQuery() {
  return useQuery({
    queryKey: quizQueryKeys.list(),
    queryFn: () => apiFetch<QuizListData>("/api/quizzes"),  });
}

/** 퀴즈 디테일 — 라인업·보기·내 도전 기록 포함 */
export function useQuizDetailQuery(id: string) {
  return useQuery({
    queryKey: quizQueryKeys.detail(id),
    queryFn: () => apiFetch<QuizDetailData>(`/api/quizzes/${id}`),
    enabled: id.length > 0,  });
}
