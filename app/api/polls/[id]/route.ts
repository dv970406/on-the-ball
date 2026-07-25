import type { NextRequest } from "next/server";
import { fail, ok, withSupabase } from "@/shared/api/handler";
import {
  POLL_DEMOGRAPHIC_SELECT,
  POLL_SELECT,
  assemblePollListItems,
  mapDemographic,
  type PollDemographicRow,
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

    // 리스트아이템 조립(공용 헬퍼) + 응답자 분석·댓글 수를 병렬로 조회
    const [items, demographicsRes, commentCountRes] = await Promise.all([
      assemblePollListItems(supabase, [poll], user?.id ?? null),
      supabase
        .from("poll_demographics")
        .select(POLL_DEMOGRAPHIC_SELECT)
        .eq("poll_id", pollId)
        .order("position", { ascending: true }),
      supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("poll_id", pollId),
    ]);
    if (!items || demographicsRes.error || commentCountRes.error) {
      return fail(500, "투표를 불러오지 못했어요.");
    }
    const listItem = items[0];
    if (!listItem) return fail(500, "투표를 불러오지 못했어요.");

    return ok<PollDetail>({
      ...listItem,
      demographics: ((demographicsRes.data ?? []) as PollDemographicRow[]).map(
        mapDemographic,
      ),
      commentCount: commentCountRes.count ?? 0,
    });
  });
}
