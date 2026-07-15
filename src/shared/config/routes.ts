/** 앱 라우트 경로 헬퍼 — 문자열 하드코딩 대신 이 객체를 사용 */
export const ROUTES = {
  home: "/",
  balanceList: "/balance",
  balanceDetail: (id: string) => `/balance/${id}`,
  quizList: "/quiz",
  quizDetail: (id: string) => `/quiz/${id}`,
  rankingDetail: (id: string) => `/ranking/${id}`,
  kitDetail: (id: string) => `/kit/${id}`,
  tmi: "/tmi",
  me: "/me",
} as const;
