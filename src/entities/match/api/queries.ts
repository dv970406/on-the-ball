"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import type {
  Match,
  MatchListPage,
  MatchPredictionResult,
  PredictionAccuracy,
} from "../model/types";
import { matchKeys } from "./keys";
import { buildMatchListQueries } from "./list-query";
import { MATCH_SELECT, buildMatch, buildMatchPredictionResult } from "./mappers";

/**
 * 경기 목록 — 지난 며칠 + 다가오는 경기.
 *
 * ⚠ **세션이 확정되기 전에는 부르지 않는다**(`enabled`). 키가 userId로 스코프돼 있어서,
 *   복원 중에 `undefined`로 한 번 조회하면 세션이 선 뒤 키가 바뀌며 목록이 통째로
 *   다시 마운트된다. **단 프리페치가 있으면 열어 둔다** — 서버가 준 userId로 이미 키가
 *   맞춰져 있는데 게이트를 닫아 두면 서버가 그린 목록을 첫 프레임에 스켈레톤이 덮는다
 *   (입축구 목록에서 실측한 사고다).
 *
 * ⚠ `initialData`의 **키 `userId`도 서버가 준 값이어야 한다.**
 */
export function useMatchListQuery(
  userId: string | undefined,
  enabled = true,
  initialData?: MatchListPage,
) {
  return useQuery<MatchListPage, Error>({
    initialData,
    queryKey: matchKeys.list(userId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      // ⚠ 기준 시각을 **여기서** 찍는다 — queryKey에 넣으면 매 렌더 새 키가 된다
      //   (`data-and-state.md`의 하이드레이션 규약). 두 쿼리가 **같은 값**을 봐야 경계에
      //   걸친 경기가 양쪽에 다 실리거나 어디에도 안 실리는 일이 없다.
      const queries = buildMatchListQueries(supabase, Date.now());
      // 서로의 결과를 쓰지 않는다 → 병렬로 보낸다
      const [past, upcoming] = await Promise.all([queries.past, queries.upcoming]);

      const error = past.error ?? upcoming.error;
      if (error) {
        console.error("[match] 목록 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return {
        past: (past.data ?? []).map(buildMatch),
        upcoming: (upcoming.data ?? []).map(buildMatch),
      };
    },
    enabled,
  });
}

/**
 * 경기 하나 — 없으면 `null`.
 *
 * ⚠ 존재 판정은 서버(`app/matches/[id]/page.tsx`)가 이미 하고 404를 낸다.
 */
export function useMatchQuery(
  matchId: number,
  userId: string | undefined,
  enabled = true,
  initialData?: Match | null,
) {
  return useQuery<Match | null, Error>({
    initialData,
    queryKey: matchKeys.detail(matchId, userId),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .from("match")
        .select(MATCH_SELECT)
        // 0행이 에러가 아니다 — single()이면 PGRST116으로 "없음"과 진짜 에러가 섞인다
        .eq("id", matchId)
        .maybeSingle();

      if (error) {
        console.error("[match] 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return data ? buildMatch(data) : null;
    },
    enabled: enabled && Number.isSafeInteger(matchId) && matchId > 0,
  });
}

/**
 * 예측 분포 — **킥오프가 지나야** 열린다.
 *
 * ⚠ 게이팅의 축이 투표·입축구와 **정반대**다. 저쪽은 "참여했는가"지만 여기는 "킥오프가
 *   지났는가"라, 마감 전에는 참여자에게도 0행이고 마감 후에는 비로그인에게도 열린다.
 *   그 축을 고른 사유는 `match_prediction_results` 함수 정의가 갖는다.
 * ⚠ `enabled`는 요청을 아끼는 것일 뿐 방어가 아니다 — 꺼도 함수가 0행을 돌려준다.
 */
export function useMatchPredictionResultsQuery(
  matchId: number,
  userId: string | undefined,
  enabled: boolean,
  initialData?: MatchPredictionResult[],
) {
  return useQuery<MatchPredictionResult[], Error>({
    initialData,
    queryKey: matchKeys.results(matchId, userId),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase.rpc("match_prediction_results", {
        p_match_id: matchId,
      });

      if (error) {
        console.error("[match] 예측 분포 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return (data ?? []).map(buildMatchPredictionResult);
    },
    enabled: enabled && Number.isSafeInteger(matchId) && matchId > 0,
  });
}

/**
 * 내 적중률.
 *
 * ⚠ **컬럼이 아니라 그때그때 센다** — 사유는 `PredictionAccuracy`(`model/types.ts`) 주석이 갖는다.
 *
 * ⚠ **`match!inner`가 필수다.** 그냥 임베딩하면 왼쪽 조인이라 경기가 없는 행까지 오고,
 *   `result`가 null인 것과 구분되지 않는다.
 * ⚠ 무효 경기는 `result`가 이미 null이라 **따로 거를 필요가 없다** — DB가 두 술어를
 *   하나로 접어 둔 덕이다.
 * ⚠ RLS가 "내 행만"이라 남의 예측은 애초에 오지 않는다. `user_id` 필터는 그 위의 안전망이다.
 */
export function useMyAccuracyQuery(userId: string | undefined) {
  return useQuery<PredictionAccuracy, Error>({
    queryKey: matchKeys.accuracy(userId),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      // ⚠ `enabled`가 이미 막지만 **컴파일러에게도 좁혀 준다** — 단언(`!`)으로 가리면
      //   그 보장이 훅 옵션에만 남아 리팩터에 조용히 깨진다(훅의 `if (!user) throw`와 같은 이중 방어).
      if (!userId) throw new Error("로그인이 필요해요.");

      /*
       * ⚠ **PostgREST의 `max_rows`(1,000)에 잘린다.** 채점 완료 예측이 그 수를 넘으면
       *   분모가 1000에 고정되고 분자도 임의의 1000건 기준이 되어 **경고 없이 틀린 적중률**이
       *   이 기능의 유일한 누적 지표 자리에 뜬다. EPL 380경기/시즌 기준 약 3시즌이라
       *   당장은 도달하지 않지만, **도달하면 조용히 틀린다**는 것이 문제다.
       *   → 그때는 세는 일을 DB로 내린다(`stable` 집계 함수). 카운터 컬럼을 만드는 것과는
       *     다르다 — 원본에서 그때그때 세는 것은 그대로다.
       * ⚠ 아래 `count`로 **전체 건수**를 함께 받아 잘림을 감지한다. 잘렸으면 화면이
       *   비율을 그리지 않는 편이 거짓 숫자보다 낫다.
       */
      const { data, error, count } = await supabase
        .from("match_prediction")
        .select("pick, match!inner(result)", { count: "exact" })
        .eq("user_id", userId)
        .not("match.result", "is", null);

      if (error) {
        console.error("[match] 적중률 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      const rows = data ?? [];
      // ⚠ 잘렸으면 셈이 거짓이다 — 숫자를 만들어 내지 않고 그 사실을 그대로 돌려준다
      if (count !== null && count > rows.length) {
        return { hits: 0, total: 0, truncated: true };
      }
      return {
        hits: rows.filter((r) => r.match?.result === r.pick).length,
        total: rows.length,
        truncated: false,
      };
    },
    enabled: Boolean(userId),
  });
}
