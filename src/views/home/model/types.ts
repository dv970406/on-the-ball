/**
 * 홈 화면 view-local 타입 — GET /api/home 응답 계약.
 * ⚠ Route Handler(app/api/home)에서도 import하는 파일 — "use client" 금지.
 */
import type { PollListItem } from "@/entities/poll/model/types";

/** 오늘의 퀴즈 다크 배너용 요약 (국기 프리뷰 포함) */
export type HomeTodayQuiz = {
  id: string;
  title: string;
  /** 도전자 수 (시드 + 실도전 합) */
  attempts: number;
  /** 정답률 % (0~100 정수) */
  accuracyPct: number;
  /** 국기 프리뷰용 라인업 — GK줄부터 4줄 (라인업 없는 문제면 빈 배열) */
  lineupRows: { pos: string; flag: string }[][];
};

/** "지금 뜨거운 떡밥" 행 — trending_items 시드 */
export type HomeTrendingItem = {
  position: number;
  title: string;
  voteCount: number;
  delta: "up" | "down" | "new";
  /** 연결된 투표 (없으면 비인터랙티브 행) */
  pollId: string | null;
};

/** GET /api/home 응답 */
export type HomeFeed = {
  /** featured=true 밸런스 폴 (없으면 null) */
  hero: PollListItem | null;
  /** 나머지 밸런스 폴 — 가벼운 양자택일 캐러셀 (position asc) */
  quickPicks: PollListItem[];
  /** 오늘의 퀴즈 (opens_on = 오늘, 없으면 null) */
  todayQuiz: HomeTodayQuiz | null;
  /** 진행 중인 투표 — ranking + kit 폴 */
  ongoing: PollListItem[];
  trending: HomeTrendingItem[];
};

/** polls.meta.hero — featured 폴의 홈 히어로 전용 문구 */
export type HeroMeta = {
  title?: string;
  sub?: string;
  /** A면 히어로 서브 문구 (SplitCard metaLine 대체) */
  aSub?: string;
  /** B면 히어로 서브 문구 */
  bSub?: string;
};

/** polls.meta.card — 홈 미니 카드 전용 라벨 (상세 title/label과 다를 때) */
export type HomeCardMeta = {
  tag?: string;
  a?: string;
  b?: string;
  title?: string;
};
