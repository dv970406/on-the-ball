import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { MY_PREDICTION_SELECT, type MyPredictionSelectRow, RANKING_LIMIT, SCORE_SELECT, TALLY_SELECT } from "./mappers";

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
 * ⚠ **비로그인이면 요청을 보내지 않는다**(`signedIn` 거짓) — anon은 정책에서 걸려 늘 빈 배열이라, 보내 봐야 왕복(브라우저는
 *   OPTIONS까지 둘)만 는다. 대신 같은 모양의 빈 결과를 돌려줘 호출부(훅·SSR)가 분기 없이 `buildDealPrediction`에 넘긴다.
 *   "로그인했는가"는 호출부가 **쿼리 키와 같은 근거**로 정한다 — 훅은 키의 `userId`, SSR은 세션 쿠키 유무.
 */
export function buildMyPredictionsQuery(supabase: SupabaseClient<Database>, dealId: number, signedIn: boolean) {
  if (!signedIn) return Promise.resolve({ data: [] as MyPredictionSelectRow[], error: null });
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
