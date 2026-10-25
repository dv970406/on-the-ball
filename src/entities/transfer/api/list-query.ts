import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
// ⚠ 직접 경로 — 이 파일은 서버 page가 import한다(`"use client"`를 담은 배럴을 거치지 않는다)
import { type KstDay, kstDateKey, parseKstDateKey } from "@/shared/lib/date-key";
import type { TransferDay, TransferDaySummary } from "../model/types";
import {
  CLUB_LIST_SELECT,
  DAY_REPORT_SELECT,
  DAY_STAMP_SELECT,
  DEAL_DETAIL_SELECT,
  DEAL_LIST_SELECT,
  FOLLOWED_CLUB_SELECT,
  REPORT_SELECT,
  TRANSFER_DAY_LIST_DAYS,
  TRANSFER_DAY_REPORT_LIMIT,
  TRANSFER_DAY_STAMP_MAX_PAGES,
  TRANSFER_DAY_STAMP_PAGE,
  TRANSFER_DEAL_LIMIT,
  buildDaySummaries,
  buildTransferDay,
  type DayStampSelectRow,
} from "./mappers";

/**
 * 이적시장 쿼리 조립의 **단일 소스** — 훅과 SSR 페이지가 같은 함수를 부른다.
 *
 * ⚠ **서버가 정렬·상한·select를 다시 짜면 안 된다.** 한 글자만 달라도 하이드레이션 직후
 *   목록이 재배열된다(훅과 SSR 페이지가 같은 함수를 부른다).
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

/** 상세의 "같은 구단의 다른 딜" 상한 */
export const RELATED_DEAL_LIMIT = 6;

/**
 * 같은 구단(출발·행선지)이 걸린 다른 딜 — 최신 보도순. 상세가 다른 딜로 가는 크롤 경로가 된다.
 *
 * ⚠ 구단 코드를 `.or()` 문자열에 싣는다 — 코드는 파생이 slugify로 만든 값(영소문자·숫자·하이픈)이지만,
 *   필터 문법을 깨는 글자(`,`·`(`·`)`)가 섞이면 조건이 바뀌므로 그 형식만 통과시킨다.
 * ⚠ 관심 구단 자리(`transfer_deal_suitor`)로는 찾지 않는다 — 임베딩 필터는 부모 행을 거르지 않아(`!inner` 없이) 조건이 되지 않는다.
 *   출발·행선지만으로 같은 구단 딜이 충분히 잡힌다.
 * ⚠ 최신 보도 임베딩의 정렬·상한은 목록과 같다(`buildDealListQuery` 주석) — 같은 select·매퍼를 쓴다.
 */
export function buildRelatedDealsQuery(
  supabase: SupabaseClient<Database>,
  dealId: number,
  clubCodes: string[],
) {
  const codes = [...new Set(clubCodes)].filter((c) => /^[a-z0-9-]+$/.test(c)).join(",");
  return supabase
    .from("transfer_deal")
    .select(DEAL_LIST_SELECT)
    .neq("id", dealId)
    .or(`from_club_code.in.(${codes}),to_club_code.in.(${codes})`)
    .order("latest_reported_at", { ascending: false })
    .order("published_at", { ascending: false, referencedTable: "latest" })
    .limit(1, { referencedTable: "latest" })
    .limit(RELATED_DEAL_LIMIT);
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

/**
 * 하루(한국 시각)의 보도 — 딜에 묶인 것만, 최신순. 상한보다 **한 건 더** 받아 잘림을 정확히 판정한다(`buildTransferDay`).
 *
 * ⚠ 경계는 인자로 받는다(`parseKstDateKey`의 시작·끝 — 하루의 자정이라 분 단위보다 거칠다). 안에서 시계를 읽지 않는다 —
 *   조건이 요청마다 달라지면 익명 Data Cache가 매번 미스다(`nextjs.md` "요청 시각을 조회 조건에 그대로 싣지 않는다").
 * ⚠ `deal_id`가 있는 보도만 — 딜에 묶이지 않은 보도(이동 아님·판정 전·같은 보도의 사본)는 보드에 없는 소식이다.
 */
export function buildDayReportsQuery(supabase: SupabaseClient<Database>, startIso: string, endIso: string) {
  return supabase
    .from("transfer_news")
    .select(DAY_REPORT_SELECT)
    .not("deal_id", "is", null)
    .gte("published_at", startIso)
    .lt("published_at", endIso)
    .order("published_at", { ascending: false })
    .limit(TRANSFER_DAY_REPORT_LIMIT + 1);
}

/**
 * 소식이 있는 이웃 날 — `before`면 그 시각 **이전**의 가장 늦은 보도, `after`면 그 시각 **이후**의 가장 이른 보도(딜에 묶인 것만).
 * 날짜 화면의 "이전 날 · 다음 날" 링크가 소식이 없는 날(404)을 가리키지 않게 한다. 경계 규약은 `buildDayReportsQuery`와 같다.
 */
export function buildNeighborDayQuery(
  supabase: SupabaseClient<Database>,
  boundaryIso: string,
  direction: "before" | "after",
) {
  const base = supabase.from("transfer_news").select(DAY_STAMP_SELECT).not("deal_id", "is", null);
  const bounded = direction === "before" ? base.lt("published_at", boundaryIso) : base.gte("published_at", boundaryIso);
  return bounded.order("published_at", { ascending: direction === "after" }).limit(1);
}

/**
 * 날짜 목록의 한 페이지 — 그 시각 이후 딜에 묶인 보도의 시각(최신순, `from`부터 `TRANSFER_DAY_STAMP_PAGE`건). 날마다 묶는 것은
 * `buildDaySummaries`다.
 * ⚠ 시작은 하루의 자정으로 내려서 받는다(위 경계 규약). 미래 시각은 조건이 아니라 매퍼가 거른다 — 지금 시각을 조건에 실으면
 *   캐시 키가 요청마다 달라진다. 페이지 범위(`range`)는 URL에 실려 페이지마다 캐시 키가 따로다(사이트맵의 딜 페이지와 같다).
 * ⚠ 정렬에 `id`를 더한다 — 같은 시각의 행이 페이지 경계에서 빠지거나 두 번 세지지 않게.
 */
export function buildDayStampsQuery(supabase: SupabaseClient<Database>, sinceIso: string, from: number) {
  return supabase
    .from("transfer_news")
    .select(DAY_STAMP_SELECT)
    .not("deal_id", "is", null)
    .gte("published_at", sinceIso)
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + TRANSFER_DAY_STAMP_PAGE - 1);
}

/**
 * 하루의 소식을 **조립까지** 한다 — 그 날의 보도와 이웃 날 둘을 병렬로 묻고 `buildTransferDay`로 묶는다.
 * 클라이언트 훅(`useTransferDayQuery`)과 날짜 page의 SSR이 같은 함수를 부른다 — 이웃 날 판정·잘림 판정이 갈리지 않게.
 * ⚠ 실패하면 PostgREST 에러를 그대로 던진다 — 한국어로 바꾸는 것은 훅의 몫이고, page는 "조회 실패(unknown)"로 가른다.
 * ⚠ 쿼리 빌더는 `await`할 때마다 요청을 새로 보낸다 — 여기서 한 번만 기다린다.
 */
export async function queryTransferDay(
  supabase: SupabaseClient<Database>,
  day: KstDay,
  nowMs: number,
): Promise<TransferDay> {
  const startIso = new Date(day.startMs).toISOString();
  const endIso = new Date(day.endMs).toISOString();
  const [reports, prev, next] = await Promise.all([
    buildDayReportsQuery(supabase, startIso, endIso),
    buildNeighborDayQuery(supabase, startIso, "before"),
    buildNeighborDayQuery(supabase, endIso, "after"),
  ]);
  const error = reports.error ?? prev.error ?? next.error;
  if (error) throw error;
  const neighborKey = (rows: { published_at: string }[] | null) =>
    rows?.[0] ? kstDateKey(Date.parse(rows[0].published_at)) : null;
  return buildTransferDay(day.key, reports.data ?? [], { prev: neighborKey(prev.data), next: neighborKey(next.data) }, nowMs);
}

/**
 * 날짜 목록의 시작 날 — 오늘을 포함해 최근 `TRANSFER_DAY_LIST_DAYS`일의 첫날(키). 쿼리 키와 조회 조건이 이 값 하나를 본다
 * (하루에 한 번만 바뀐다 — 익명 Data Cache가 요청마다 미스하지 않는다).
 */
export function daySummaryStartKey(nowMs: number): string {
  return kstDateKey(nowMs - (TRANSFER_DAY_LIST_DAYS - 1) * 86_400_000);
}

/**
 * 날짜 목록을 조립까지 한다 — 시작 날 이후의 보도 시각을 페이지로 넘겨 받아 날마다 센다(`buildDaySummaries`).
 * ⚠ `nowMs`는 미래 보도를 거르는 데만 쓴다(조건에 싣지 않는다). 페이지 상한에 닿았으면 가장 오래된 날을 뺀다.
 * ⚠ 페이지는 차례로 받는다 — 앞 페이지가 덜 차면 끝이라 다음을 보낼지 알 수 없다(대개 한 페이지로 끝난다).
 */
export async function queryDaySummaries(
  supabase: SupabaseClient<Database>,
  startKey: string,
  nowMs: number,
): Promise<TransferDaySummary[]> {
  const start = parseKstDateKey(startKey);
  if (!start) return [];
  const sinceIso = new Date(start.startMs).toISOString();
  const rows: DayStampSelectRow[] = [];
  for (let page = 0; page < TRANSFER_DAY_STAMP_MAX_PAGES; page += 1) {
    const { data, error } = await buildDayStampsQuery(supabase, sinceIso, page * TRANSFER_DAY_STAMP_PAGE);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < TRANSFER_DAY_STAMP_PAGE) return buildDaySummaries(rows, { nowMs, truncated: false });
  }
  return buildDaySummaries(rows, { nowMs, truncated: true });
}

/**
 * 5대 리그 구단 전부 — 응원 구단을 고르는 화면의 목록.
 * ⚠ 리그가 있는 행만 받는다 — `transfer_club`에는 보도에 스친 하부 리그·타 대륙 구단도 들어 있다(엠블럼도 한국어 표기도 없다).
 *   5대 리그 구단은 파생이 표시 프리셋에서 전부 채워 둔다(딜이 없는 구단도 있다 — `api-and-db.md`).
 */
export function buildClubListQuery(supabase: SupabaseClient<Database>) {
  return supabase.from("transfer_club").select(CLUB_LIST_SELECT).not("league", "is", null);
}

/**
 * 내 응원 구단.
 * ⚠ **유저 필터를 걸지 않는다** — SELECT 정책이 "내 행만"이라 필터가 곧 정책이다. 그래서 세션이 실린 클라이언트로만
 *   부른다(anon에는 이 표의 SELECT grant가 없어 42501이다 — 비로그인 경로에서 부르지 않는다).
 */
export function buildFollowedClubsQuery(supabase: SupabaseClient<Database>) {
  return supabase.from("transfer_club_follow").select(FOLLOWED_CLUB_SELECT);
}
