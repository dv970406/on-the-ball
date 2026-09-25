import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  DEAL_DETAIL_SELECT,
  DEAL_LIST_SELECT,
  REPORT_SELECT,
  TRANSFER_DEAL_LIMIT,
} from "./mappers";

/**
 * 이적시장 쿼리 조립의 **단일 소스** — 훅과 SSR 페이지가 같은 함수를 부른다.
 *
 * ⚠ **서버가 정렬·상한·select를 다시 짜면 안 된다.** 한 글자만 달라도 하이드레이션 직후
 *   목록이 재배열된다(`buildPostListQuery`·`buildMatchListQueries`와 같은 규약).
 * ⚠ 이 파일에 `"use client"`를 붙이지 않는다 — 서버 페이지가 import해야 한다.
 */

/**
 * 보드의 딜 목록 — 범위 시작 이후 최신 보도순.
 *
 * ⚠ **범위 시작을 인자로 받는다.** 값은 `boardScopeStartMs(nowMs)`(`@/shared/config`)를
 *   ISO로 만든 것인데, 안에서 시계를 읽으면 훅과 서버가 다른 순간을 보게 된다. ⚠ 서버는
 *   그 값을 **분 단위로 내려서** 넘긴다 — ms 시각이 URL에 실리면 익명 Data Cache가 매번 미스다
 *   (`nextjs.md` "요청 시각을 조회 조건에 그대로 싣지 않는다"). 창 개장 시각은 정각이라 지금은
 *   내릴 것이 없지만, 호출부가 그 규약을 진다.
 * ⚠ **최신 보도 임베딩의 정렬·상한을 여기서 건다.** select 문자열에는 임베딩 정렬을 적을 수
 *   없고, 이걸 빠뜨리면 `latest`가 "임의의 한 건"이 된다(빌드도 타입도 못 잡는다).
 *   별칭(`latest`)으로 `referencedTable`을 지정할 수 있다(로컬 PostgREST에 실측).
 */
export function buildDealListQuery(supabase: SupabaseClient<Database>, scopeStartIso: string) {
  return supabase
    .from("transfer_deal")
    .select(DEAL_LIST_SELECT)
    .gte("latest_reported_at", scopeStartIso)
    .order("latest_reported_at", { ascending: false })
    .order("published_at", { ascending: false, referencedTable: "latest" })
    .limit(1, { referencedTable: "latest" })
    .limit(TRANSFER_DEAL_LIMIT);
}

/** 딜 하나 — 0행이 에러가 아니다(`maybeSingle`) */
export function buildDealQuery(supabase: SupabaseClient<Database>, dealId: number) {
  return supabase.from("transfer_deal").select(DEAL_DETAIL_SELECT).eq("id", dealId).maybeSingle();
}

/**
 * 상세의 보도 타임라인 — 최신순.
 * ⚠ 상한을 두지 않는다 — 딜 하나의 보도는 수십 건이 상한이고, 타임라인이 잘리면 "N REPORTS"가
 *   거짓이 된다. PostgREST `max_rows`(1,000)를 넘는 딜이 생기면 그때 페이지네이션을 붙인다.
 */
export function buildReportsQuery(supabase: SupabaseClient<Database>, dealId: number) {
  return supabase
    .from("transfer_news")
    .select(REPORT_SELECT)
    .eq("deal_id", dealId)
    .order("published_at", { ascending: false });
}
