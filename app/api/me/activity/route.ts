import { fail, ok, withSupabase } from "@/shared/api/handler";
import type { MyActivity } from "@/views/activity/model/types";
import {
  RECENT_LIMIT,
  buildActivityProfile,
  buildActivityRecent,
  buildActivityStats,
  buildActivityTrait,
  type AttemptRow,
  type PollResultRow,
  type ProfileRow,
  type VoteRow,
} from "./mappers";

const LOAD_FAIL = "내 활동을 불러오지 못했어요.";

/** GET /api/me/activity — 내 활동 요약 (세션 없으면 null) */
export async function GET() {
  return withSupabase(async ({ supabase, user }) => {
    if (!user) return ok<MyActivity | null>(null);

    // 서로 독립인 조회는 병렬로
    const [
      profileRes,
      voteCountRes,
      attemptStatsRes,
      recentVotesRes,
      recentAttemptsRes,
    ] = await Promise.all([
      // my_profile 뷰 — 본인 전체 행 (profiles 직접 조회는 공개 컬럼만 허용됨)
      supabase
        .from("my_profile")
        .select("nickname, fan_team, current_streak, trait_title, trait_text, created_at")
        .maybeSingle(),
      supabase.from("votes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      // 정답률 계산용 — 내 전체 시도의 정오답만
      supabase.from("quiz_attempts").select("is_correct").eq("user_id", user.id),
      supabase
        .from("votes")
        .select("poll_id, option_id, created_at, polls(type, title), poll_options(label)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT),
      supabase
        .from("quiz_attempts")
        .select("is_correct, created_at, quizzes(title), quiz_choices(team)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT),
    ]);

    if (
      profileRes.error ||
      voteCountRes.error ||
      attemptStatsRes.error ||
      recentVotesRes.error ||
      recentAttemptsRes.error
    ) {
      return fail(500, LOAD_FAIL);
    }

    const profile = profileRes.data as ProfileRow | null;
    if (!profile) return ok<MyActivity | null>(null);

    // 최근 투표한 폴의 현재 집계(poll_results)로 내 옵션 비율을 계산 — 조회는 라우트, 매핑은 매퍼
    const recentVotes = (recentVotesRes.data ?? []) as unknown as VoteRow[];
    const pollIds = [...new Set(recentVotes.map((v) => v.poll_id))];

    let pollResults: PollResultRow[] = [];
    if (pollIds.length > 0) {
      const { data: resultData, error: resultsError } = await supabase
        .from("poll_results")
        .select("poll_id, option_id, votes")
        .in("poll_id", pollIds);
      if (resultsError) return fail(500, LOAD_FAIL);
      pollResults = (resultData ?? []) as PollResultRow[];
    }

    const attemptStats = (attemptStatsRes.data ?? []) as { is_correct: boolean }[];

    return ok<MyActivity>({
      profile: buildActivityProfile(profile),
      stats: buildActivityStats(voteCountRes.count ?? 0, attemptStats, profile.current_streak),
      recent: buildActivityRecent(
        recentVotes,
        (recentAttemptsRes.data ?? []) as unknown as AttemptRow[],
        pollResults,
      ),
      trait: buildActivityTrait(profile),
    });
  });
}
