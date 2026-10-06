// ⚠ "use client" 모듈 포함 — 서버에서는 model/types·api/mappers·api/keys·api/list-query를 직접 import한다.
export type { DealPrediction, PredictionScore, PredictionTally } from "./model/types";
export { predictionKeys } from "./api/keys";
// 결과가 다른 사용자로 그려졌을 때의 자리 표시(내 표만 지운다) — `useTransferDetail`
export { withoutMyPredictions } from "./api/mappers";
export { useDealPredictionQuery, useMyScoreQuery, useRankingQuery } from "./api/queries";
// 집계 읽기·낙관적 갱신이 **같은 계산**을 쓴다
export {
  applyPick,
  latestVotedRound,
  myPickOf,
  tallyOf,
  yesShare,
} from "./lib/tally";
