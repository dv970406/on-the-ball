// /api/me/activity 응답 조립 — 라우트가 조회한 DB 행을 계약(views/activity/model/types)으로 매핑한다.
// user·poll·quiz를 가로지르는 집계라 단일 entity 매퍼가 아니라 라우트에 co-locate 한다
// (응답 계약은 /api/home과 동일하게 해당 화면 model에 두고, 여기선 타입 전용으로 참조 — "use client" 금지).
import { COLOR } from "@/shared/config";
import type { PollType } from "@/entities/poll/model/types";
import type {
  ActivityBadge,
  ActivityProfile,
  ActivityRecent,
  ActivityStats,
  ActivityTrait,
} from "@/views/activity/model/types";

/** 최근 활동 조회 상한 — 투표·시도를 각각 이만큼 받아 병합 후 이 개수만 노출 */
export const RECENT_LIMIT = 10;

// ---------------------------------------------------------------------------
// DB 행 타입
// ---------------------------------------------------------------------------

export type ProfileRow = {
  nickname: string;
  fan_team: string | null;
  current_streak: number;
  trait_title: string | null;
  trait_text: string | null;
  created_at: string;
};

export type VoteRow = {
  poll_id: number;
  option_id: number;
  created_at: string;
  polls: { type: PollType; title: string } | { type: PollType; title: string }[] | null;
  poll_options: { label: string } | { label: string }[] | null;
};

export type AttemptRow = {
  is_correct: boolean;
  created_at: string;
  quizzes: { title: string } | { title: string }[] | null;
  quiz_choices: { team: string } | { team: string }[] | null;
};

export type BadgeRow = {
  id: number;
  label: string;
  description: string | null;
  color: string | null;
};

export type PollResultRow = { poll_id: number; option_id: number; votes: number };

/** PostgREST to-one 임베드가 객체/배열 어느 쪽으로 와도 첫 행만 취한다 */
function one<T>(rel: T | T[] | null): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

/** badges.color 의 프로토타입 CSS 변수 표기를 실제 헥스로 정규화 */
const CSS_VAR_COLORS: Record<string, string> = {
  "var(--primary)": COLOR.primary,
  "var(--primary-deep)": COLOR.primaryDeep,
  "var(--hairline-strong)": COLOR.hairlineStrong,
};

function normalizeBadgeColor(color: string | null): string {
  if (!color) return COLOR.hairlineStrong;
  return CSS_VAR_COLORS[color] ?? color;
}

/** trait 미산출 시 기본 문구 */
const DEFAULT_TRAIT: ActivityTrait = {
  title: "분석 중",
  text: "투표와 퀴즈가 쌓이면 매월 성향 리포트가 열려요.",
};

// ---------------------------------------------------------------------------
// 행 → 계약 매핑 (순수 함수)
// ---------------------------------------------------------------------------

/** my_profile 행 → 공개 프로필 요약 */
export function buildActivityProfile(profile: ProfileRow): ActivityProfile {
  return {
    nickname: profile.nickname,
    fanTeam: profile.fan_team,
    joinedAt: profile.created_at,
  };
}

/** 투표수 + 퀴즈 정오답 → 통계 (정답률은 반올림 %, 0건이면 0) */
export function buildActivityStats(
  voteCount: number,
  attemptStats: { is_correct: boolean }[],
  streak: number,
): ActivityStats {
  const correctCount = attemptStats.filter((a) => a.is_correct).length;
  return {
    votes: voteCount,
    quizzes: attemptStats.length,
    streak,
    accuracyPct:
      attemptStats.length > 0 ? Math.round((100 * correctCount) / attemptStats.length) : 0,
  };
}

/** 전체 뱃지 × 내 획득 여부 → 뱃지 목록 */
export function buildActivityBadges(
  badgeRows: BadgeRow[],
  myBadgeRows: { badge_id: number }[],
): ActivityBadge[] {
  const earnedIds = new Set(myBadgeRows.map((b) => b.badge_id));
  return badgeRows.map((b) => ({
    id: b.id,
    label: b.label,
    description: b.description,
    color: normalizeBadgeColor(b.color),
    earned: earnedIds.has(b.id),
  }));
}

/** 최근 투표 + 퀴즈 시도를 시간순 병합 (내 옵션 현재 비율은 poll_results로 계산) */
export function buildActivityRecent(
  voteRows: VoteRow[],
  attemptRows: AttemptRow[],
  pollResults: PollResultRow[],
): ActivityRecent[] {
  const totalByPoll = new Map<number, number>();
  const votesByOption = new Map<number, number>();
  for (const row of pollResults) {
    totalByPoll.set(row.poll_id, (totalByPoll.get(row.poll_id) ?? 0) + row.votes);
    votesByOption.set(row.option_id, row.votes);
  }

  const voteItems: ActivityRecent[] = voteRows.map((v) => {
    const poll = one(v.polls);
    const option = one(v.poll_options);
    const total = totalByPoll.get(v.poll_id) ?? 0;
    const mine = votesByOption.get(v.option_id) ?? 0;
    return {
      kind: poll?.type ?? "balance",
      title: poll?.title ?? "",
      pick: option?.label ?? "",
      when: v.created_at,
      agreeRatio: total > 0 ? mine / total : 0,
      isCorrect: null,
    };
  });

  const attemptItems: ActivityRecent[] = attemptRows.map((a) => ({
    kind: "quiz" as const,
    title: one(a.quizzes)?.title ?? "",
    pick: one(a.quiz_choices)?.team ?? "",
    when: a.created_at,
    agreeRatio: null,
    isCorrect: a.is_correct,
  }));

  return [...voteItems, ...attemptItems]
    .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
    .slice(0, RECENT_LIMIT);
}

/** 프로필의 trait_* → 성향 리포트 (미산출 시 기본 문구) */
export function buildActivityTrait(profile: ProfileRow): ActivityTrait {
  return profile.trait_title && profile.trait_text
    ? { title: profile.trait_title, text: profile.trait_text }
    : DEFAULT_TRAIT;
}
