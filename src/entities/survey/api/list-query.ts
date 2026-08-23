import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SURVEY_LIST_LIMIT, SURVEY_LIST_SELECT } from "./mappers";

/**
 * 서베이 목록 쿼리 조립의 **단일 소스** — 훅과 SSR 페이지가 같은 함수를 부른다.
 *
 * ⚠ **서버가 정렬·상한·select를 다시 짜면 안 된다.** 한 글자만 달라도 하이드레이션 직후
 *   목록이 재배열된다 — `buildPostListQuery`가 글 목록에 대해 하는 일과 같다.
 * ⚠ 이 파일에 `"use client"`를 붙이지 않는다. 서버 페이지가 import해야 한다
 *   (같은 이유로 상한·select 상수도 `api/mappers.ts`에 있다).
 */
export function buildSurveyListQuery(supabase: SupabaseClient<Database>) {
  return (
    supabase
      .from("survey")
      .select(SURVEY_LIST_SELECT)
      // id는 identity라 created_at과 같은 순서다 — tie-breaker 없이 id 하나로 정렬한다
      .order("id", { ascending: false })
      .limit(SURVEY_LIST_LIMIT)
  );
}
