import type { Database } from "@/types/database.types";

/**
 * 딜 성사 예측 도메인 타입 (순수 — 서버에서도 import 가능).
 *
 * 질문은 "이번 이적 창 안에 오피셜이 뜰까?"이고, 한 창에 한 딜당 한 표다. 표의 회차(어느 창의 표인가)는
 * DB 트리거가 정한다 — 화면은 그 값을 받아 그릴 뿐이다(`api-and-db.md` 딜 성사 예측 절).
 *
 * ⚠ 슬라이스 이름(`prediction`)과 테이블 이름(`transfer_deal_prediction`…)이 다르다 — 슬라이스는 도메인 개념이다.
 */
export type PredictionRow = Database["public"]["Tables"]["transfer_deal_prediction"]["Row"];
export type PredictionTallyRow = Database["public"]["Tables"]["transfer_deal_prediction_tally"]["Row"];
export type PredictionScoreRow = Database["public"]["Tables"]["transfer_prediction_score"]["Row"];

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/** 한 회차의 집계 — 남의 표는 이것으로만 드러난다(표 행은 본인만 본다) */
export interface PredictionTally {
  roundKey: PredictionTallyRow["round_key"];
  yes: PredictionTallyRow["yes_count"];
  no: PredictionTallyRow["no_count"];
}

/** 내 표 하나 */
export interface MyPrediction {
  roundKey: PredictionRow["round_key"];
  /** true = 성사 · false = 불발 */
  willHappen: PredictionRow["will_happen"];
}

/**
 * 한 딜의 예측 — 회차별 집계와 내 표.
 * ⚠ `mine`은 SELECT 정책이 "내 행만"이라 응답이 **사용자별**이다 → 쿼리 키가 userId로 스코프된다(`predictionKeys`).
 *   비로그인은 항상 빈 배열이다.
 */
export interface DealPrediction {
  tallies: PredictionTally[];
  mine: MyPrediction[];
}

/** 예측 랭킹의 한 줄 */
export interface PredictionScore {
  userId: PredictionScoreRow["user_id"];
  /** profiles 임베딩에서 온다 */
  nickname: ProfileRow["nickname"];
  /** 아바타의 **경로**(전체 URL이 아니다) — 화면이 `avatarUrl()`로 조립한다 */
  avatarPath: ProfileRow["avatar_path"];
  points: PredictionScoreRow["points"];
  hits: PredictionScoreRow["hits"];
  scored: PredictionScoreRow["scored"];
  rank: PredictionScoreRow["rank"];
}
