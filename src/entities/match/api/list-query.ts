import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  MATCH_LIST_LOOKBACK_MS,
  MATCH_PAST_LIMIT,
  MATCH_SELECT,
  MATCH_UPCOMING_LIMIT,
} from "./mappers";

/**
 * 경기 목록 쿼리 조립의 **단일 소스** — 훅과 SSR 페이지가 같은 함수를 부른다.
 *
 * ⚠ **서버가 정렬·상한·select를 다시 짜면 안 된다.** 한 글자만 달라도 하이드레이션 직후
 *   목록이 재배열된다(`buildPostListQuery`·`buildSurveyListQuery`와 같은 규약).
 * ⚠ 이 파일에 `"use client"`를 붙이지 않는다 — 서버 페이지가 import해야 한다.
 *
 * ⚠ **쿼리를 둘로 가르는 것이 규약이다.** 한 쿼리에 상한 하나로 두면 지난 경기가 상한을
 *   채워 **다가오는 경기를 0건으로 굶긴다**(사유는 `MATCH_PAST_LIMIT` 주석의 실측).
 *   구역이 쿼리 단위로 갈리면 화면이 클라이언트 시계로 다시 나눌 일도 없어진다 —
 *   **어느 구역인지는 조회 조건이 이미 정한다.**
 *
 * ⚠ **기준 시각을 인자로 받는다.** 안에서 `Date.now()`를 부르면 렌더 중 시계를 읽는 셈이라
 *   `react-hooks/purity`에 걸리고(서버 컴포넌트에도 걸린다), 무엇보다 두 쿼리가 서로 다른
 *   순간을 보면 경계에 걸친 경기가 **양쪽에 다 실리거나 어디에도 안 실린다.**
 */
export function buildMatchListQueries(supabase: SupabaseClient<Database>, nowMs: number) {
  const boundary = new Date(nowMs).toISOString();
  return {
    /** 최근 것부터 — 결과는 방금 끝난 경기부터 보는 것이 자연스럽다 */
    past: supabase
      .from("match")
      .select(MATCH_SELECT)
      .lt("kickoff_at", boundary)
      .gte("kickoff_at", new Date(nowMs - MATCH_LIST_LOOKBACK_MS).toISOString())
      .order("kickoff_at", { ascending: false })
      .limit(MATCH_PAST_LIMIT),
    /** 가까운 것부터 — 다음에 예측할 경기가 위에 온다. ⚠ 창을 걸지 않는다(예측 대상이다) */
    upcoming: supabase
      .from("match")
      .select(MATCH_SELECT)
      .gte("kickoff_at", boundary)
      .order("kickoff_at", { ascending: true })
      .limit(MATCH_UPCOMING_LIMIT),
  };
}
