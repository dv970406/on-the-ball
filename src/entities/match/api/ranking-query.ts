import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { MatchRanking } from "../model/types";
import { LEADERBOARD_LIMIT, buildLeaderboardEntry } from "./mappers";

const MINUTE_MS = 60_000;

function floorToMinute(ms: number) {
  return Math.floor(ms / MINUTE_MS) * MINUTE_MS;
}

/**
 * 랭킹 화면 조립의 **단일 소스** — 훅과 SSR 페이지가 같은 함수를 부른다.
 *
 * ⚠ **서버가 범위·상한을 다시 짜면 안 된다.** 한 값만 달라도 하이드레이션 직후 목록이
 *   재배열된다(`buildMatchListQueries`와 같은 규약). 그래서 조회 하나가 아니라 **세 조회의
 *   순서와 인자까지** 이 함수가 갖는다.
 * ⚠ 이 파일에 `"use client"`를 붙이지 않는다 — 서버 페이지가 import해야 한다.
 *
 * ⚠ **범위를 시계로 정하지 않는다.** "채점이 끝난 가장 최근 경기"의 시즌·라운드를 쓴다.
 *   - 시즌: 시즌 문자열(`'2025-26'`)이 사전순이 곧 시간순이라 `season desc`가 최신 시즌이다.
 *   - 라운드: 그 시즌에서 채점된 **가장 큰** 라운드. 킥오프 순서로 고르지 않는 이유는
 *     연기 경기 때문이다 — 3라운드 연기분이 10라운드 주간에 치러지면 "최근 라운드"가
 *     잠깐 3으로 되돌아간다.
 *   - 비시즌(새 시즌 일정만 있고 결과가 없다)에는 **지난 시즌의 최종 순위**가 뜬다.
 *     빈 화면보다 낫고, 새 시즌 첫 경기가 채점되는 순간 저절로 넘어간다.
 * ⚠ 삭제된 경기는 정책(`match_select_alive`)이, 무효 경기는 `result is null`이 거른다 —
 *   범위를 정하는 조회와 RPC의 집계가 **같은 경기 집합**을 본다.
 *
 * ⚠ **캐시 키는 URL(과 본문)이다.** 비로그인 SSR은 Data Cache를 타므로 요청마다 바뀌는 값을
 *   조회 조건에 싣지 않는다 — 범위 조회의 기준 시각을 분 단위로 내리는 이유다(아래).
 *   RPC를 GET(`get: true`)으로 부르는 것은 인자가 URL에 드러나 키를 로그에서 대조할 수 있어서다
 *   (POST도 명시적 `revalidate`가 있으면 캐시된다). 함수가 `stable`이라 PostgREST가 GET을 받아 준다.
 *
 * ⚠ 에러를 던지지 않고 돌려준다 — 서버는 실패하면 `undefined`로 폴백하고(프리페치는
 *   최적화일 뿐이다) 훅은 한국어 메시지로 바꿔 던진다. 쓰임이 갈려 호출부가 정한다.
 */
export async function fetchMatchRanking(
  supabase: SupabaseClient<Database>,
): Promise<{ data: MatchRanking | null; error: PostgrestError | null }> {
  const scope = await supabase
    .from("match")
    .select("season, matchday")
    .not("result", "is", null)
    // ⚠ RPC와 **같은 경기 집합**을 봐야 한다 — 함수가 킥오프 전 경기를 세지 않으므로(제공자가
    //   "종료 + 미래 날짜"를 준 경우) 범위도 그 경기로 정하지 않는다. 안 그러면 그 경기뿐인
    //   라운드가 "최근 라운드"로 뽑혀 빈 판이 뜬다.
    // ⚠ **기준 시각을 분 단위로 내린다.** Data Cache의 키는 URL 전체라, ms까지 찍힌 시각을
    //   그대로 넣으면 익명 SSR의 이 조회만 **요청마다 캐시 미스 + 새 캐시 엔트리**가 된다
    //   (실측: 5회 요청에 fetch-cache 5개 증가, 매번 DB 도달 — 두 RPC는 히트).
    //   내려서 잃는 것은 "킥오프 1분 안에 결과까지 들어온 경기"뿐이라 범위 판정이 달라지지 않는다.
    .lte("kickoff_at", new Date(floorToMinute(Date.now())).toISOString())
    .order("season", { ascending: false })
    .order("matchday", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (scope.error) return { data: null, error: scope.error };
  // 채점된 경기가 하나도 없다 — 에러가 아니라 "아직 순위가 없다"는 정상 상태다
  if (!scope.data) return { data: null, error: null };

  const { season, matchday } = scope.data;
  // 두 판은 서로의 결과를 쓰지 않는다 → 병렬로 보낸다
  const [seasonBoard, roundBoard] = await Promise.all([
    supabase.rpc(
      "match_leaderboard",
      { p_season: season, p_limit: LEADERBOARD_LIMIT },
      { get: true },
    ),
    supabase.rpc(
      "match_leaderboard",
      { p_season: season, p_matchday: matchday, p_limit: LEADERBOARD_LIMIT },
      { get: true },
    ),
  ]);

  const error = seasonBoard.error ?? roundBoard.error;
  if (error) return { data: null, error };

  return {
    data: {
      season,
      matchday,
      seasonBoard: (seasonBoard.data ?? []).map(buildLeaderboardEntry),
      roundBoard: (roundBoard.data ?? []).map(buildLeaderboardEntry),
    },
    error: null,
  };
}
