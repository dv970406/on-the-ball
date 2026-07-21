import { fail, ok, withSupabase } from "@/shared/api/handler";
import {
  POLL_OPTION_SELECT,
  POLL_SELECT,
  buildLikesByPoll,
  buildPollListItem,
  buildVotesByOption,
  fetchMyLikesByPoll,
  fetchMyVotesByPoll,
  groupOptionsByPoll,
  type PollLikeStatsRow,
  type PollOptionRow,
  type PollResultRow,
  type PollRow,
} from "@/entities/poll/api/mappers";
import {
  LINEUP_SELECT,
  QUIZ_SELECT,
  QUIZ_STATS_SELECT,
  type LineupRow,
  type QuizRow,
  type QuizStatsRow,
} from "@/entities/quiz/api/mappers";
import type { HomeFeed, HomeTrendingItem } from "@/views/home/model/types";
import { todayUtc } from "@/shared/lib/format";

/** trending_items 테이블 행 — 연결 poll의 slug를 임베드해 공개 식별자로 사용 */
interface TrendingRow {
  position: number;
  title: string;
  vote_count: number;
  delta: "up" | "down" | "new";
  polls: { slug: string } | { slug: string }[] | null;
}

/** PostgREST to-one 임베드가 객체/배열 어느 쪽으로 와도 첫 행만 취한다 */
function oneSlug(rel: { slug: string } | { slug: string }[] | null): string | null {
  if (rel == null) return null;
  const row = Array.isArray(rel) ? (rel[0] ?? null) : rel;
  return row?.slug ?? null;
}

const HOME_FETCH_ERROR = "홈 피드를 불러오지 못했어요.";

/**
 * GET /api/home — 홈 피드 조합
 *  - hero: featured=true 밸런스 폴 / quickPicks: 나머지 밸런스 폴 (position asc)
 *  - todayQuiz: opens_on = 오늘인 퀴즈 + 라인업 국기 프리뷰 + 집계
 *  - ongoing: ranking → kit 순 진행 중 투표
 *  - trending: trending_items 시드 (position asc)
 */
export async function GET() {
  return withSupabase(async ({ supabase, user }) => {
    // 1) 컨테이너 병렬 조회 — 홈에 오르는 폴 3종 + 오늘의 퀴즈 + 트렌딩
    const [pollsRes, quizRes, trendingRes] = await Promise.all([
      supabase
        .from("polls")
        .select(POLL_SELECT)
        .in("type", ["balance", "ranking", "kit"])
        .order("position", { ascending: true }),
      // quizzes는 answer_text 컬럼 권한이 없어 select 컬럼 명시 필수
      supabase
        .from("quizzes")
        .select(QUIZ_SELECT)
        .eq("opens_on", todayUtc())
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("trending_items")
        .select("position, title, vote_count, delta, polls(slug)")
        .order("position", { ascending: true }),
    ]);
    if (pollsRes.error || quizRes.error || trendingRes.error) {
      return fail(500, HOME_FETCH_ERROR);
    }

    const polls = (pollsRes.data ?? []) as PollRow[];
    const quiz = (quizRes.data ?? null) as QuizRow | null;
    const trendingRows = (trendingRes.data ?? []) as TrendingRow[];
    const pollIds = polls.map((p) => p.id);

    // 2) 선택지·득표 집계·좋아요 수 + 퀴즈 라인업·통계 병렬 조회 (폴이 없으면 빈 in() 쿼리 회피)
    const [optionsRes, resultsRes, likesRes, statsRes, lineupRes] = await Promise.all([
      pollIds.length > 0
        ? supabase
            .from("poll_options")
            .select(POLL_OPTION_SELECT)
            .in("poll_id", pollIds)
            .order("position", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      pollIds.length > 0
        ? supabase
            .from("poll_results")
            .select("poll_id, option_id, votes")
            .in("poll_id", pollIds)
        : Promise.resolve({ data: [], error: null }),
      pollIds.length > 0
        ? supabase
            .from("poll_like_stats")
            .select("poll_id, likes")
            .in("poll_id", pollIds)
        : Promise.resolve({ data: [], error: null }),
      quiz
        ? supabase
            .from("quiz_stats")
            .select(QUIZ_STATS_SELECT)
            .eq("quiz_id", quiz.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      quiz?.lineup_id
        ? supabase
            .from("lineups")
            .select(LINEUP_SELECT)
            .eq("id", quiz.lineup_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (
      optionsRes.error ||
      resultsRes.error ||
      likesRes.error ||
      statsRes.error ||
      lineupRes.error
    ) {
      return fail(500, HOME_FETCH_ERROR);
    }

    // 3) 내 투표·내 좋아요 — 세션 유저 있을 때만 (RLS로 본인 행만, 빈 pollIds면 빈 값)
    const [myVoteByPoll, myLikedPolls] = await Promise.all([
      fetchMyVotesByPoll(supabase, user?.id ?? null, pollIds),
      fetchMyLikesByPoll(supabase, user?.id ?? null, pollIds),
    ]);

    // 4) PollListItem 조합
    const optionsByPoll = groupOptionsByPoll(
      (optionsRes.data ?? []) as PollOptionRow[],
    );
    const votesByOption = buildVotesByOption(
      (resultsRes.data ?? []) as PollResultRow[],
    );
    const likesByPoll = buildLikesByPoll(
      (likesRes.data ?? []) as PollLikeStatsRow[],
    );

    const items = polls.map((poll) =>
      buildPollListItem(
        poll,
        optionsByPoll.get(poll.id) ?? [],
        votesByOption,
        myVoteByPoll.get(poll.id) ?? null,
        likesByPoll.get(poll.id) ?? 0,
        myLikedPolls.has(poll.id),
      ),
    );

    // 5) 섹션 분배 — hero는 featured 밸런스 1건, ongoing은 ranking → kit 순
    const balances = items.filter((item) => item.type === "balance");
    const hero = balances.find((item) => item.featured) ?? null;
    const quickPicks = balances.filter((item) => item !== hero);
    const ongoing = [
      ...items.filter((item) => item.type === "ranking"),
      ...items.filter((item) => item.type === "kit"),
    ];

    const stats = (statsRes.data ?? null) as QuizStatsRow | null;
    const lineup = (lineupRes.data ?? null) as LineupRow | null;
    const todayQuiz: HomeFeed["todayQuiz"] = quiz
      ? {
          id: quiz.slug,
          title: quiz.title,
          attempts: stats?.attempts ?? 0,
          accuracyPct: stats?.accuracy_pct ?? 0,
          lineupRows: lineup?.rows ?? [],
        }
      : null;

    const trending: HomeTrendingItem[] = trendingRows.map((row) => ({
      position: row.position,
      title: row.title,
      voteCount: row.vote_count,
      delta: row.delta,
      pollId: oneSlug(row.polls),
    }));

    return ok<HomeFeed>({ hero, quickPicks, todayQuiz, ongoing, trending });
  });
}
