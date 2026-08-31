// ⚠ "use client" 모듈 포함 — 서버에서는 model/types·api/mappers·api/keys·api/list-query를
//    직접 import한다(`entities/survey`·`entities/post`와 같은 형태).
//
// ⚠ **다른 레이어가 소비하지 않는 것은 올리지 않는다.** `MATCH_PICKS`·`MATCH_PICK_LABEL`·
//    `Team`·`PredictionAccuracy`는 이 슬라이스 안에서만 쓰여 배럴에서 뺐다 —
//    `check:conventions`가 이 유형을 **잡지 못하므로**(상대 경로 소비도 "현역"으로 센다)
//    손으로 지킨다. `entities/survey`가 `SurveyOption`·`SplitCount`를 같은 이유로 뺐다.
export type { Match, MatchListPage, MatchPick, MatchPredictionResult } from "./model/types";
export { matchKeys } from "./api/keys";
// ⚠ 상한은 서버 안전한 api/mappers에 있다 — 목록 SSR이 같은 값을 써야 한다.
//    구역별로 갈린 이유는 그 파일 주석에(한 상한이면 지난 경기가 다가오는 경기를 굶긴다).
export { MATCH_PAST_LIMIT, MATCH_UPCOMING_LIMIT } from "./api/mappers";
export {
  useMatchListQuery,
  useMatchPredictionResultsQuery,
  useMatchQuery,
  useMyAccuracyQuery,
} from "./api/queries";
// ⚠ 시각 판정을 함수가 단독으로 소유한다 — **features와 SSR 페이지가 같은 답**을 내야 하고,
//    `isMatchOpen`은 DB의 `match_is_open`과도 같은 판정이어야 한다.
// ⚠ **`isPredictionResultsOpen`은 `!isMatchOpen`이 아니다** — 취소가 두 판정에 다르게
//    작용해서 뒤집기로 합성되지 않는다(그 파일 주석에 실측 사고가 적혀 있다).
// ⚠ `isMatchSettled`도 올린다 — 상세 화면이 적중/실패를 말하려면 필요하다
//   (슬라이스 안에서만 쓰이던 동안에는 올리지 않았다).
// ⚠ `isAwaitingResult`도 뒤집기로 합성되지 않는다 — 목록 카드와 상세가 **같은 어휘**로
//    `결과 대기`를 말해야 해서 함수 하나가 단독으로 소유한다.
export {
  isAwaitingResult,
  isMatchInProgress,
  isMatchOpen,
  isMatchSettled,
  isPredictionResultsOpen,
} from "./lib/open";
// ⚠ 날짜 묶음은 **화면 형태가 아니라 도메인 규칙**이다(KST 하루 · 킥오프 정렬 전제) —
//    목록 뷰가 두 구역에 같은 함수를 쓴다.
export { groupMatchesByDay } from "./lib/day-group";
export { MatchCard } from "./ui/match-card";
// ⚠ 상세도 엠블럼을 그리므로 배럴에 올린다(카드는 같은 슬라이스라 상대 경로로 가져간다).
export { TeamCrest } from "./ui/team-crest";
export { PredictionBlock } from "./ui/prediction-block";
