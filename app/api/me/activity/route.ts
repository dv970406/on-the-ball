import { fail, ok, withSupabase } from "@/shared/api/handler";
import { COLOR } from "@/shared/config";
import type { PollType } from "@/entities/poll/model/types";
// 응답 계약의 단일 정의 — views/activity와 공유 (타입 전용 import라 서버에서 안전)
import type {
  ActivityBadge,
  ActivityRecent,
  ActivityStats,
  ActivityTrait,
  MyActivity,
} from "@/views/activity/model/types";

// ---------------------------------------------------------------------------
// DB 행 타입
// ---------------------------------------------------------------------------

type ProfileRow = {
  nickname: string;
  fan_team: string | null;
  current_streak: number;
  trait_title: string | null;
  trait_text: string | null;
  created_at: string;
};

type VoteRow = {
  poll_id: string;
  option_id: string;
  created_at: string;
  polls: { type: PollType; title: string } | { type: PollType; title: string }[] | null;
  poll_options: { label: string } | { label: string }[] | null;
};

type AttemptRow = {
  is_correct: boolean;
  created_at: string;
  quizzes: { title: string } | { title: string }[] | null;
  quiz_choices: { team: string } | { team: string }[] | null;
};

type BadgeRow = {
  id: string;
  label: string;
  description: string | null;
  color: string | null;
};

type PollResultRow = { poll_id: string; option_id: string; votes: number };

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

const LOAD_FAIL = "내 활동을 불러오지 못했어요.";

/** GET /api/me/activity — 내 활동 요약 (세션 없으면 null) */
export async function GET() {
  return withSupabase(async ({ supabase, user }) => {
    if (!user) return ok<MyActivity | null>(null);

    // 서로 독립인 조회는 병렬로
    const [profileRes, voteCountRes, attemptStatsRes, recentVotesRes, recentAttemptsRes, badgesRes, myBadgesRes] =
      await Promise.all([
        // my_profile 뷰 — 본인 전체 행 (profiles 직접 조회는 공개 컬럼만 허용됨)
        supabase
          .from("my_profile")
          .select("nickname, fan_team, current_streak, trait_title, trait_text, created_at")
          .maybeSingle(),
        supabase
          .from("votes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        // 정답률 계산용 — 내 전체 시도의 정오답만
        supabase.from("quiz_attempts").select("is_correct").eq("user_id", user.id),
        supabase
          .from("votes")
          .select("poll_id, option_id, created_at, polls(type, title), poll_options(label)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("quiz_attempts")
          .select("is_correct, created_at, quizzes(title), quiz_choices(team)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("badges")
          .select("id, label, description, color")
          .order("position", { ascending: true }),
        supabase.from("user_badges").select("badge_id").eq("user_id", user.id),
      ]);

    if (
      profileRes.error ||
      voteCountRes.error ||
      attemptStatsRes.error ||
      recentVotesRes.error ||
      recentAttemptsRes.error ||
      badgesRes.error ||
      myBadgesRes.error
    ) {
      return fail(500, LOAD_FAIL);
    }

    const profile = profileRes.data as ProfileRow | null;
    if (!profile) return ok<MyActivity | null>(null);

    // ----- stats -----
    const attemptStats = (attemptStatsRes.data ?? []) as { is_correct: boolean }[];
    const correctCount = attemptStats.filter((a) => a.is_correct).length;
    const stats: ActivityStats = {
      votes: voteCountRes.count ?? 0,
      quizzes: attemptStats.length,
      streak: profile.current_streak,
      accuracyPct:
        attemptStats.length > 0 ? Math.round((100 * correctCount) / attemptStats.length) : 0,
    };

    // ----- badges (전체 × 내 획득 여부) -----
    const earnedIds = new Set(
      ((myBadgesRes.data ?? []) as { badge_id: string }[]).map((b) => b.badge_id),
    );
    const badges: ActivityBadge[] = ((badgesRes.data ?? []) as BadgeRow[]).map((b) => ({
      id: b.id,
      label: b.label,
      description: b.description,
      color: normalizeBadgeColor(b.color),
      earned: earnedIds.has(b.id),
    }));

    // ----- recent: 내 옵션의 현재 비율(poll_results) -----
    const recentVotes = (recentVotesRes.data ?? []) as unknown as VoteRow[];
    const pollIds = [...new Set(recentVotes.map((v) => v.poll_id))];

    const totalByPoll = new Map<string, number>();
    const votesByOption = new Map<string, number>();
    if (pollIds.length > 0) {
      const { data: resultData, error: resultsError } = await supabase
        .from("poll_results")
        .select("poll_id, option_id, votes")
        .in("poll_id", pollIds);
      if (resultsError) return fail(500, LOAD_FAIL);

      for (const row of (resultData ?? []) as PollResultRow[]) {
        totalByPoll.set(row.poll_id, (totalByPoll.get(row.poll_id) ?? 0) + row.votes);
        votesByOption.set(row.option_id, row.votes);
      }
    }

    const voteItems: ActivityRecent[] = recentVotes.map((v) => {
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

    const attemptItems: ActivityRecent[] = (
      (recentAttemptsRes.data ?? []) as unknown as AttemptRow[]
    ).map((a) => ({
      kind: "quiz" as const,
      title: one(a.quizzes)?.title ?? "",
      pick: one(a.quiz_choices)?.team ?? "",
      when: a.created_at,
      agreeRatio: null,
      isCorrect: a.is_correct,
    }));

    // created_at desc 병합 후 최근 10건
    const recent = [...voteItems, ...attemptItems]
      .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
      .slice(0, 10);

    // ----- trait -----
    const trait: ActivityTrait =
      profile.trait_title && profile.trait_text
        ? { title: profile.trait_title, text: profile.trait_text }
        : DEFAULT_TRAIT;

    return ok<MyActivity>({
      profile: {
        nickname: profile.nickname,
        fanTeam: profile.fan_team,
        joinedAt: profile.created_at,
      },
      stats,
      badges,
      recent,
      trait,
    });
  });
}
