/**
 * 홈 피드 조립 — GET /api/home 라우트와 홈 페이지(서버 프리페치)가 공유한다.
 * ⚠ Route Handler·서버 컴포넌트에서 import하는 파일 — "use client" 금지.
 *   (슬라이스 배럴 `@/views/home`은 클라 UI를 포함하므로 이 파일은 배럴에 싣지 않는다.
 *    소비는 `@/views/home/api/build-home-feed` deep 경로로만)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  POLL_SELECT,
  assemblePollListItems,
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
import { readLineupRows } from "@/entities/quiz/lib/lineup-meta";
import { todayUtc } from "@/shared/lib/format";
import type { HomeFeed, HomeTrendingItem } from "../model/types";

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

/**
 * 홈 피드 조합 (조회 실패 시 null — 호출부가 fail 메시지·폴백을 결정)
 *  - hero: featured=true 밸런스 폴 / quickPicks: 나머지 밸런스 폴 (position asc)
 *  - todayQuiz: opens_on = 오늘인 퀴즈 + 라인업 국기 프리뷰 + 집계
 *  - ongoing: ranking → kit 순 진행 중 투표
 *  - trending: trending_items 시드 (position asc)
 */
export async function buildHomeFeed(
  supabase: SupabaseClient,
  userId: string | null,
): Promise<HomeFeed | null> {
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
  if (pollsRes.error || quizRes.error || trendingRes.error) return null;

  const polls = (pollsRes.data ?? []) as PollRow[];
  const quiz = (quizRes.data ?? null) as QuizRow | null;
  const trendingRows = (trendingRes.data ?? []) as TrendingRow[];

  // 2) 리스트아이템 조립(공용 헬퍼) + 퀴즈 통계·라인업 병렬 조회 (동시성 유지)
  const [items, statsRes, lineupRes] = await Promise.all([
    assemblePollListItems(supabase, polls, userId),
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
  if (!items || statsRes.error || lineupRes.error) return null;

  // 3) 섹션 분배 — hero는 featured 밸런스 1건, ongoing은 ranking → kit 순
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
        lineupRows: readLineupRows(lineup?.rows),
      }
    : null;

  const trending: HomeTrendingItem[] = trendingRows.map((row) => ({
    position: row.position,
    title: row.title,
    voteCount: row.vote_count,
    delta: row.delta,
    pollId: oneSlug(row.polls),
  }));

  return { hero, quickPicks, todayQuiz, ongoing, trending };
}
