import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { MY_PREDICTION_SELECT, RANKING_LIMIT, SCORE_SELECT, TALLY_SELECT } from "./mappers";

/**
 * 예측 조회 조립의 **단일 소스** — 훅과 SSR 페이지가 같은 함수를 부른다.
 * ⚠ 이 파일에 `"use client"`를 붙이지 않는다 — 서버 페이지가 import해야 한다.
 */

/** 한 딜의 회차별 집계(공개) */
export function buildTallyQuery(supabase: SupabaseClient<Database>, dealId: number) {
  return supabase.from("transfer_deal_prediction_tally").select(TALLY_SELECT).eq("deal_id", dealId);
}

/**
 * 한 딜의 내 표. ⚠ 유저 필터를 걸지 않는다 — SELECT 정책이 "내 행만"이라 필터가 곧 정책이다.
 *   비로그인(anon)은 grant만 있고 정책에서 걸려 빈 배열을 받는다(서버 조회가 세션으로 갈라 부를 필요가 없다).
 */
export function buildMyPredictionsQuery(supabase: SupabaseClient<Database>, dealId: number) {
  return supabase.from("transfer_deal_prediction").select(MY_PREDICTION_SELECT).eq("deal_id", dealId);
}

/**
 * 랭킹 — 순위순 상위 `RANKING_LIMIT`줄. 같은 순위 안의 순서는 **채점(`scorePredictions`)과 같다** — 적중 많은 순 →
 * 채점 적은 순 → 사용자 id. 마지막 키가 순서를 고정한다(불안정하면 하이드레이션 직후 동점자의 자리가 바뀐다).
 */
export function buildRankingQuery(supabase: SupabaseClient<Database>) {
  return supabase
    .from("transfer_prediction_score")
    .select(SCORE_SELECT)
    .order("rank")
    .order("hits", { ascending: false })
    .order("scored")
    .order("user_id")
    .limit(RANKING_LIMIT);
}

/** 한 사람의 점수 — 채점된 표가 없으면 행이 없다(`maybeSingle`) */
export function buildScoreQuery(supabase: SupabaseClient<Database>, userId: string) {
  return supabase.from("transfer_prediction_score").select(SCORE_SELECT).eq("user_id", userId).maybeSingle();
}
