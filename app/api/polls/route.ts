import type { NextRequest } from "next/server";
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
import { POLL_TYPES, type PollListItem, type PollType } from "@/entities/poll/model/types";

/**
 * GET /api/polls?type=balance|ranking|kit|tmi — 투표 리스트 (position asc)
 *
 * 결과 수치(votes/ratio)는 항상 포함한다 — 리스트 카드가 비율 바를 노출하기 때문.
 * "투표한 사람만 결과를 본다"는 결과 게이팅은 디테일 화면 UI가 담당한다.
 */
export async function GET(request: NextRequest) {
  const typeParam = request.nextUrl.searchParams.get("type");
  if (typeParam !== null && !POLL_TYPES.includes(typeParam as PollType)) {
    return fail(400, "지원하지 않는 투표 유형이에요.");
  }
  const type = typeParam as PollType | null;

  return withSupabase(async ({ supabase, user }) => {
    // 1) 투표 컨테이너
    let pollsQuery = supabase
      .from("polls")
      .select(POLL_SELECT)
      .order("position", { ascending: true });
    if (type) pollsQuery = pollsQuery.eq("type", type);

    const { data: pollData, error: pollsError } = await pollsQuery;
    if (pollsError) return fail(500, "투표 목록을 불러오지 못했어요.");

    const polls = (pollData ?? []) as PollRow[];
    if (polls.length === 0) return ok<PollListItem[]>([]);

    const pollIds = polls.map((p) => p.id);

    // 2) 선택지 + 득표 집계(시드 + 실투표) + 좋아요 수 병렬 조회
    const [optionsRes, resultsRes, likesRes] = await Promise.all([
      supabase
        .from("poll_options")
        .select(POLL_OPTION_SELECT)
        .in("poll_id", pollIds)
        .order("position", { ascending: true }),
      supabase
        .from("poll_results")
        .select("poll_id, option_id, votes")
        .in("poll_id", pollIds),
      supabase
        .from("poll_like_stats")
        .select("poll_id, likes")
        .in("poll_id", pollIds),
    ]);
    if (optionsRes.error || resultsRes.error || likesRes.error) {
      return fail(500, "투표 목록을 불러오지 못했어요.");
    }

    // 3) 내 투표·내 좋아요 (세션 없으면 빈 값 — RLS로 본인 행만 조회됨)
    const [myVoteByPoll, myLikedPolls] = await Promise.all([
      fetchMyVotesByPoll(supabase, user?.id ?? null, pollIds),
      fetchMyLikesByPoll(supabase, user?.id ?? null, pollIds),
    ]);

    // 4) poll_id 기준으로 조합
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

    return ok<PollListItem[]>(items);
  });
}
