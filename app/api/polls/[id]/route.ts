import type { NextRequest } from "next/server";
import { fail, ok, withSupabase } from "@/shared/api/handler";
import {
  POLL_DEMOGRAPHIC_SELECT,
  POLL_OPTION_SELECT,
  POLL_SELECT,
  buildPollListItem,
  buildVotesByOption,
  fetchMyVotesByPoll,
  mapDemographic,
  type PollDemographicRow,
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
  const { id } = await params;

  return withSupabase(async ({ supabase, user }) => {
    const { data: pollData, error: pollError } = await supabase
      .from("polls")
      .select(POLL_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (pollError) return fail(500, "투표를 불러오지 못했어요.");
    if (!pollData) return fail(404, "투표를 찾을 수 없어요.");

    const poll = pollData as PollRow;

    // 선택지·득표·응답자 분석·댓글 수 병렬 조회
    const [optionsRes, resultsRes, demographicsRes, commentCountRes] =
      await Promise.all([
        supabase
          .from("poll_options")
          .select(POLL_OPTION_SELECT)
          .eq("poll_id", id)
          .order("position", { ascending: true }),
        supabase
          .from("poll_results")
          .select("poll_id, option_id, votes")
          .eq("poll_id", id),
        supabase
          .from("poll_demographics")
          .select(POLL_DEMOGRAPHIC_SELECT)
          .eq("poll_id", id)
          .order("position", { ascending: true }),
        supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .eq("poll_id", id),
      ]);
    if (
      optionsRes.error ||
      resultsRes.error ||
      demographicsRes.error ||
      commentCountRes.error
    ) {
      return fail(500, "투표를 불러오지 못했어요.");
    }

    // 내 투표 (세션 없으면 빈 맵 — RLS로 본인 행만 조회됨)
    const myVoteByPoll = await fetchMyVotesByPoll(supabase, user?.id ?? null, [id]);

    const listItem = buildPollListItem(
      poll,
      (optionsRes.data ?? []) as PollOptionRow[],
      buildVotesByOption((resultsRes.data ?? []) as PollResultRow[]),
      myVoteByPoll.get(id) ?? null,
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
