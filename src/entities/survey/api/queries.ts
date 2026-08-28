"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import type { Survey, SurveyListItem, SurveyResult } from "../model/types";
import { surveyKeys } from "./keys";
import { buildSurveyListQuery } from "./list-query";
import {
  SURVEY_SELECT,
  buildSurvey,
  buildSurveyListItem,
  buildSurveyResult,
} from "./mappers";

export interface SurveyListPage {
  items: SurveyListItem[];
}

/**
 * 입축구 목록 — 최신순.
 *
 * ⚠ **세션이 확정되기 전에는 부르지 않는다**(`enabled`). 키가 userId로 스코프돼 있어서,
 *   복원 중에 `undefined`로 한 번 조회하면 세션이 선 뒤 키가 바뀌며 목록이 통째로
 *   다시 마운트된다(`usePollQuery`와 같은 이유).
 */
/**
 * ⚠ `initialData`는 **서버 프리페치의 결과**다(SEO — 목록·상세 모두 서버가 그린다).
 *   ⚠ **키의 `userId`도 서버가 준 값이어야 한다** — 세션 복원 전 `undefined`로 찾으면
 *     캐시에 닿지 못해 목록이 스켈레톤으로 되돌아간다(호출부가 그 값을 넘긴다).
 */
export function useSurveyListQuery(
  userId: string | undefined,
  enabled = true,
  initialData?: SurveyListPage,
) {
  return useQuery<SurveyListPage, Error>({
    initialData,
    queryKey: surveyKeys.list(userId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      // ⚠ 조립은 `buildSurveyListQuery`가 단독으로 소유한다 — SSR 페이지가 같은 함수를 부른다
      const { data, error } = await buildSurveyListQuery(supabase);

      if (error) {
        console.error("[survey] 목록 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return { items: (data ?? []).map(buildSurveyListItem) };
    },
    enabled,
  });
}

/**
 * 입축구 하나 — 없으면 `null`.
 *
 * ⚠ 존재 판정은 서버(`app/surveys/[id]/page.tsx`)가 이미 하고 404를 낸다. 여기서 `null`이
 *   되는 것은 그 사이에 지워졌을 때뿐이라, 화면은 그 경우만 안내하면 된다.
 */
/**
 * ⚠ `initialData`는 **서버 프리페치의 결과**다(SEO). 넘어오면 쿼리가 즉시 success가 되어
 *   서버가 그린 HTML과 첫 렌더가 같은 값을 본다.
 *   ⚠ **키의 `userId`도 서버가 준 값이어야 한다** — 세션 복원 전 `undefined`로 찾으면
 *     캐시에 닿지 못해 화면이 스켈레톤으로 되돌아간다(호출부가 그 값을 넘긴다).
 */
export function useSurveyQuery(
  surveyId: number,
  userId: string | undefined,
  enabled = true,
  initialData?: Survey | null,
) {
  return useQuery<Survey | null, Error>({
    initialData,
    queryKey: surveyKeys.detail(surveyId, userId),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .from("survey")
        .select(SURVEY_SELECT)
        .eq("id", surveyId)
        // 0행이 에러가 아니다 — single()이면 PGRST116으로 "없음"과 진짜 에러가 섞인다
        .maybeSingle();

      if (error) {
        console.error("[survey] 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return data ? buildSurvey(data) : null;
    },
    enabled: enabled && Number.isSafeInteger(surveyId) && surveyId > 0,
  });
}

/**
 * 선택지별 득표수 — **참여한 사람에게만** 열린다(미참여자에게는 0행이 온다).
 *
 * ⚠ 게이팅이 화면이 아니라 DB에 있다. v1은 수치를 항상 내려주고 UI에서만 가려
 *   "실제로는 게이팅이 아니었다"(`docs/legacy/v1-inventory.md` 판단 #4).
 * ⚠ `enabled`는 최적화일 뿐 방어가 아니다 — 꺼도 `survey_results`가 0행을 돌려준다.
 *   비로그인은 EXECUTE 권한 자체가 없다.
 */
/**
 * ⚠ `initialData`는 **서버 프리페치의 결과**다. 없으면 참여한 사용자의 화면에서 막대가
 *   스켈레톤으로 그려졌다가 집계가 도착하며 늘어나 **눈에 띄는 시프트**가 된다.
 *   ⚠ 서버도 게이팅을 그대로 받는다 — 쿠키 세션으로 부르므로 미참여자에게는 0행이다.
 *     그래서 **참여했을 때만** 프리페치하고, 아니면 `undefined`를 넘겨 쿼리를 꺼 둔다
 *     (0행을 `[]`로 넘기면 "열렸는데 0표"라는 다른 뜻이 된다).
 */
export function useSurveyResultsQuery(
  surveyId: number,
  userId: string | undefined,
  enabled: boolean,
  initialData?: SurveyResult[],
) {
  return useQuery<SurveyResult[], Error>({
    initialData,
    queryKey: surveyKeys.results(surveyId, userId),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase.rpc("survey_results", { p_survey_id: surveyId });

      if (error) {
        console.error("[survey] 집계 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return (data ?? []).map(buildSurveyResult);
    },
    enabled: enabled && Number.isSafeInteger(surveyId) && surveyId > 0,
  });
}
