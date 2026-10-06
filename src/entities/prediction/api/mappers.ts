import type { Database } from "@/types/database.types";
import type {
  DealPrediction,
  PredictionRow,
  PredictionScore,
  PredictionScoreRow,
  PredictionTallyRow,
} from "../model/types";

/**
 * 랭킹 화면에 싣는 줄 수.
 * ⚠ **`api/queries.ts`가 아니라 여기 있다** — 그 파일은 `"use client"`라 서버가 import할 수 없는데, 랭킹 페이지의
 *   SSR이 같은 상한을 써야 한다(`COMMENT_LIST_LIMIT`과 같은 사정).
 */
export const RANKING_LIMIT = 100;

/**
 * ⚠ **select 문자열을 `+`로 잇지 않는다** — supabase-js가 리터럴 타입을 파싱해 결과 형태를 만든다.
 */
export const TALLY_SELECT = "round_key, yes_count, no_count" as const;
/** ⚠ 유저 필터가 없다 — SELECT 정책이 "내 행만"이다(`transfer_deal_watch`와 같은 구조) */
export const MY_PREDICTION_SELECT = "round_key, will_happen" as const;
/**
 * ⚠ **profiles 컬럼을 여기에 싣는다** — `features/update-profile`이 닉네임·아바타를 바꿀 때 랭킹 캐시도 무효화해야
 *   한다(`invalidateProfileConsumers`가 `predictionKeys.ranking()`·`scores()`를 함께 무효화한다).
 */
export const SCORE_SELECT =
  "user_id, points, hits, scored, rank, profile:user_id(nickname, avatar_path)" as const;

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export type TallySelectRow = Pick<PredictionTallyRow, "round_key" | "yes_count" | "no_count">;
export type MyPredictionSelectRow = Pick<PredictionRow, "round_key" | "will_happen">;
export type ScoreSelectRow = Pick<PredictionScoreRow, "user_id" | "points" | "hits" | "scored" | "rank"> & {
  profile: Pick<ProfileRow, "nickname" | "avatar_path"> | null;
};

/**
 * 조회 결과 → 한 딜의 예측. ⚠ **훅과 SSR 페이지가 이 함수 하나를 부른다**(댓글의 `buildCommentList`와 같은 이유).
 */
export function buildDealPrediction(
  tallyRows: TallySelectRow[],
  myRows: MyPredictionSelectRow[],
): DealPrediction {
  return {
    tallies: tallyRows.map((r) => ({ roundKey: r.round_key, yes: r.yes_count, no: r.no_count })),
    mine: myRows.map((r) => ({ roundKey: r.round_key, willHappen: r.will_happen })),
  };
}

/**
 * 내 표를 지운 사본 — 서버가 **다른 사용자**로 그린 예측을 자리 표시로만 쓸 때(`useTransferDetail`). 집계는 누구에게나
 * 같아 그대로 둔다.
 */
export function withoutMyPredictions(prediction: DealPrediction): DealPrediction {
  return { tallies: prediction.tallies, mine: [] };
}

export function buildPredictionScore(row: ScoreSelectRow): PredictionScore {
  return {
    userId: row.user_id,
    nickname: row.profile?.nickname ?? "알 수 없음",
    avatarPath: row.profile?.avatar_path ?? null,
    points: row.points,
    hits: row.hits,
    scored: row.scored,
    rank: row.rank,
  };
}
