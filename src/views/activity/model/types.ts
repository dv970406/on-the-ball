// /api/me/activity 응답 계약 — 라우트(app/api/me/activity)와 훅이 이 단일 정의를 공유한다.
// ⚠ 서버(Route Handler)에서도 import하므로 "use client" 지시어 금지.
import type { PollType } from "@/entities/poll/model/types";

export type ActivityProfile = {
  nickname: string;
  fanTeam: string | null;
  joinedAt: string;
};

export type ActivityStats = {
  votes: number;
  quizzes: number;
  streak: number;
  /** 퀴즈 정답률 (반올림 %, 0건이면 0) */
  accuracyPct: number;
};

export type ActivityRecent = {
  kind: PollType | "quiz";
  title: string;
  /** 내가 고른 라벨 (옵션 label 또는 선택한 team) */
  pick: string;
  /** ISO 시각 */
  when: string;
  /** 폴이면 내 옵션의 현재 비율(0~1), 퀴즈면 null */
  agreeRatio: number | null;
  /** 퀴즈면 정오답, 폴이면 null */
  isCorrect: boolean | null;
};

export type ActivityTrait = { title: string; text: string };

export type MyActivity = {
  profile: ActivityProfile;
  stats: ActivityStats;
  recent: ActivityRecent[];
  trait: ActivityTrait;
};
