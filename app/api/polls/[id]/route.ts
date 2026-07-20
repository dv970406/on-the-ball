import type { NextRequest } from "next/server";
import { fail, ok, withSupabase } from "@/shared/api/handler";
import {
  POLL_DEMOGRAPHIC_SELECT,
  POLL_OPTION_SELECT,
  POLL_SELECT,
  buildPollListItem,
  buildVotesByOption,
  fetchMyLikesByPoll,
  fetchMyVotesByPoll,
  mapDemographic,
  type PollDemographicRow,
  type PollLikeStatsRow,
  type PollOptionRow,
  type PollResultRow,
  type PollRow,
} from "@/entities/poll/api/mappers";
import type { PollDetail } from "@/entities/poll/model/types";

/**
 * GET /api/polls/[id] — 투표 디테일 (응답자 분석 + 댓글 수 포함)
 * 결과 수치는 항상 포함 — 결과 게이팅(투표 전 숨김)은 디테일 화면 UI가 담당.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: slug } = await params;

  return withSupabase(async ({ supabase, user }) => {
    // [id]는 slug — polls.slug로 조회해 정수 id 확보
    const { data: pollData, error: pollError } = await supabase
      .from("polls")
      .select(POLL_SELECT)
      .eq("slug", slug)
      .maybeSingle();
    if (pollError) return fail(500, "투표를 불러오지 못했어요.");
    if (!pollData) return fail(404, "투표를 찾을 수 없어요.");

    const poll = pollData as PollRow;
    const pollId = poll.id;

    // 선택지·득표·응답자 분석·댓글 수·좋아요 수 병렬 조회 (정수 poll_id 기준)
    const [optionsRes, resultsRes, demographicsRes, commentCountRes, likesRes] =
      await Promise.all([
        supabase
          .from("poll_options")
          .select(POLL_OPTION_SELECT)
          .eq("poll_id", pollId)
          .order("position", { ascending: true }),
        supabase
          .from("poll_results")
          .select("poll_id, option_id, votes")
          .eq("poll_id", pollId),
        supabase
          .from("poll_demographics")
          .select(POLL_DEMOGRAPHIC_SELECT)
          .eq("poll_id", pollId)
          .order("position", { ascending: true }),
        supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .eq("poll_id", pollId),
        supabase
          .from("poll_like_stats")
          .select("poll_id, likes")
          .eq("poll_id", pollId)
          .maybeSingle(),
      ]);
    if (
      optionsRes.error ||
      resultsRes.error ||
      demographicsRes.error ||
      commentCountRes.error ||
      likesRes.error
    ) {
      return fail(500, "투표를 불러오지 못했어요.");
    }

    // 내 투표·내 좋아요 (세션 없으면 빈 값 — RLS로 본인 행만 조회됨)
    const [myVoteByPoll, myLikedPolls] = await Promise.all([
      fetchMyVotesByPoll(supabase, user?.id ?? null, [pollId]),
      fetchMyLikesByPoll(supabase, user?.id ?? null, [pollId]),
    ]);

    const listItem = buildPollListItem(
      poll,
      (optionsRes.data ?? []) as PollOptionRow[],
      buildVotesByOption((resultsRes.data ?? []) as PollResultRow[]),
      myVoteByPoll.get(pollId) ?? null,
      (likesRes.data as PollLikeStatsRow | null)?.likes ?? 0,
      myLikedPolls.has(pollId),
    );

    return ok<PollDetail>({
      ...listItem,
      demographics: ((demographicsRes.data ?? []) as PollDemographicRow[]).map(
        mapDemographic,
      ),
      commentCount: commentCountRes.count ?? 0,
    });
  });
}
