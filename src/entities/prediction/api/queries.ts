"use client";

import { useQuery } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import type { DealPrediction, PredictionScore } from "../model/types";
import { predictionKeys } from "./keys";
import { buildMyPredictionsQuery, buildRankingQuery, buildScoreQuery, buildTallyQuery } from "./list-query";
import { buildDealPrediction, buildPredictionScore } from "./mappers";

interface UseDealPredictionQueryArgs {
  dealId: number;
  userId: string | undefined;
  enabled?: boolean;
  /** 서버 프리페치 — ⚠ 서버가 **같은 사용자**로 그린 것만 넣는다(`useTransferDetail`) */
  initialData?: DealPrediction;
  /**
   * 서버가 그 데이터를 읽은 시각(ms, 기기 시계로 옮긴 값). ⚠ 빼면 뒤로가기가 되살린 옛 서버 페이로드가 신선한
   * 것으로 앉는다(`useCommentListQuery`와 같은 사고).
   */
  initialDataUpdatedAt?: number | (() => number | undefined);
  /** 서버가 **다른 사용자**로 그린 예측을 내 표를 지워 넘긴다(`withoutMyPredictions`) */
  placeholderData?: DealPrediction;
}

/**
 * 한 딜의 예측 — 회차별 집계(공개)와 내 표("내 행만"). 두 조회를 함께 보낸다.
 * ⚠ 조립은 `buildTallyQuery`·`buildMyPredictionsQuery`·`buildDealPrediction`이 단독으로 소유한다 — SSR이 같은 함수를 부른다.
 */
export function useDealPredictionQuery({
  dealId,
  userId,
  enabled = true,
  initialData,
  initialDataUpdatedAt,
  placeholderData,
}: UseDealPredictionQueryArgs) {
  return useQuery<DealPrediction, Error>({
    initialData,
    initialDataUpdatedAt,
    placeholderData,
    queryKey: predictionKeys.deal(dealId, userId),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      const [tally, mine] = await Promise.all([
        buildTallyQuery(supabase, dealId),
        buildMyPredictionsQuery(supabase, dealId),
      ]);
      const error = tally.error ?? mine.error;
      if (error) {
        console.error("[prediction] 딜 예측 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return buildDealPrediction(tally.data ?? [], mine.data ?? []);
    },
    enabled: enabled && Number.isSafeInteger(dealId) && dealId > 0,
  });
}

interface UseRankingQueryArgs {
  /** 서버 프리페치 — 랭킹은 "나"와 무관해 사용자 대조 없이 그대로 넣는다 */
  initialData?: PredictionScore[];
  initialDataUpdatedAt?: number | (() => number | undefined);
}

/** 예측 랭킹 상위 `RANKING_LIMIT`줄(공개) */
export function useRankingQuery({ initialData, initialDataUpdatedAt }: UseRankingQueryArgs = {}) {
  return useQuery<PredictionScore[], Error>({
    initialData,
    initialDataUpdatedAt,
    queryKey: predictionKeys.ranking(),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await buildRankingQuery(supabase);
      if (error) {
        console.error("[prediction] 랭킹 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return (data ?? []).map(buildPredictionScore);
    },
  });
}

/**
 * 한 사람의 점수 — 채점된 표가 없으면 `null`이다.
 * ⚠ `userId`를 인자로 받는다 — 세션을 아는 상위 레이어가 넘긴다(`useProfileQuery`와 같은 형태). 없으면 조회하지 않는다.
 */
export function useMyScoreQuery(userId: string | undefined) {
  return useQuery<PredictionScore | null, Error>({
    queryKey: predictionKeys.score(userId ?? ""),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      // `enabled`가 막아 여기에는 늘 값이 있다 — 타입만 좁힌다
      const { data, error } = await buildScoreQuery(supabase, userId ?? "");
      if (error) {
        console.error("[prediction] 점수 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return data ? buildPredictionScore(data) : null;
    },
    enabled: Boolean(userId),
  });
}
