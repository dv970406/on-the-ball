/** 퀴즈 유형 — DB kind 컬럼은 한글 자유값 ('라인업'|'레전드'|'TMI'|'국적'|'코치') */
export type QuizKind = string;

/** 내 도전 결과 — 미도전이면 null */
export type QuizMyResult = "correct" | "wrong" | null;

/** 퀴즈 리스트 항목 (오늘/예정/지난 공용) */
export type QuizSummary = {
  id: string;
  kind: QuizKind;
  title: string;
  subtitle: string | null;
  /** 오픈 날짜 'YYYY-MM-DD' — 매일 오전 8시 오픈 개념 */
  opensOn: string;
  /** 도전자 수 (시드 + 실도전 합) */
  attempts: number;
  /** 정답률 % (0~100 정수) */
  accuracyPct: number;
  myResult: QuizMyResult;
};

/** GET /api/quizzes 응답 — 오늘의 문제 / 예정(잠금) / 지난 보관함 */
export type QuizListData = {
  today: QuizSummary | null;
  upcoming: QuizSummary[];
  past: QuizSummary[];
};

/** 라인업 피치의 셀 하나 — 포지션 라벨 + 국기 코드 */
export type LineupCell = {
  pos: string;
  flag: string;
};

/** 라인업 — rows는 GK줄부터 4줄 11셀 */
export type QuizLineup = {
  formation: string;
  caption: string | null;
  rows: LineupCell[][];
};

/** 4지선다 보기 — 정답 여부는 포함하지 않음 (치팅 방지) */
export type QuizChoice = {
  id: string;
  position: number;
  team: string;
  season: string | null;
  /** 이 보기를 고른 수 (시드 + 실픽 합) */
  picks: number;
  /** 전체 픽 대비 비율 (0~1) */
  pickRatio: number;
};

/** 내 도전 기록 — 정답 정보는 시도한 유저에게만 quiz_reveal로 공개 */
export type QuizMyAttempt = {
  choiceId: string;
  isCorrect: boolean;
  correctChoiceId: string | null;
  answerText: string | null;
};

/** GET /api/quizzes/[id] 응답 */
export type QuizDetailData = {
  id: string;
  kind: QuizKind;
  title: string;
  subtitle: string | null;
  hint: string | null;
  opensOn: string;
  attempts: number;
  accuracyPct: number;
  /** 라인업 문제가 아니면 null */
  lineup: QuizLineup | null;
  choices: QuizChoice[];
  /** 미도전이면 null — 있으면 바로 done 상태로 렌더 */
  myAttempt: QuizMyAttempt | null;
};

/** POST /api/quizzes/[id]/attempts 응답 — RPC 판정 + 최신 선택률 */
export type QuizAttemptResult = {
  isCorrect: boolean;
  correctChoiceId: string | null;
  answerText: string | null;
  /** 제출 직후의 연속 정답 일수 (오답이면 0) */
  streak: number;
  /** 내 픽이 반영된 최신 선택률 (조회 실패 시 빈 배열) */
  choices: QuizChoice[];
};
