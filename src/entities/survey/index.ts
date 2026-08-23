// ⚠ "use client" 모듈 포함 — 서버에서는 model/types·api/mappers·api/keys를 직접 import한다.
// ⚠ `SurveyOption`은 올리지 않는다 — `Survey.options`로만 소비되어 호출부가 0이다
//   (`entities/poll`이 `PollOption`을 내부 타입으로 둔 것과 같다).
export type { Survey, SurveyListItem, SurveyResult } from "./model/types";
export { surveyKeys } from "./api/keys";
// ⚠ 상한은 서버 안전한 api/mappers에 있다 — 목록 SSR이 같은 값을 써야 한다
export { SURVEY_LIST_LIMIT } from "./api/mappers";
export {
  type SurveyListPage,
  useSurveyListQuery,
  useSurveyQuery,
  useSurveyResultsQuery,
} from "./api/queries";
// ⚠ `splitCount`가 "분할 카드로 그릴 문항인가"를 **단독으로** 판정한다 —
//   히어로(views)와 참여 UI(features)가 같은 답을 내야 한다.
// ⚠ `SplitCount` 타입은 올리지 않는다 — 슬라이스 내부(`SplitCard`)만 쓰므로 외부 호출부가
//   0이다. 상대 경로 소비는 `check:conventions`가 "현역"으로 세어 잡지 못한다.
export { splitCount } from "./lib/split-layout";
// ⚠ 마감 판정도 함수 하나가 소유한다 — 목록·상세·features가 같은 답을 내야 한다.
export { isSurveyOpen } from "./lib/open";
export { SurveyBlock } from "./ui/survey-block";
export { SplitCard } from "./ui/split-card";
export { SurveyCard } from "./ui/survey-card";
