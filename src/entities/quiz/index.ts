// quiz 엔티티 public API
// ⚠ Route Handler에서는 이 배럴 대신 서버 안전 경로를 직접 import:
//   - "@/entities/quiz/model/types" (타입)
//   - "@/entities/quiz/api/mappers" (snake_case → camelCase 매퍼)
export type {
  QuizKind,
  QuizMyResult,
  QuizSummary,
  QuizListData,
  LineupCell,
  QuizLineup,
  QuizChoice,
  QuizMyAttempt,
  QuizDetailData,
  QuizAttemptResult,
} from "./model/types";
export {
  quizQueryKeys,
  useQuizListQuery,
  useQuizDetailQuery,
} from "./api/queries";
