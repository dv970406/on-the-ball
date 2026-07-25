import type { NextRequest } from "next/server";
import { fail, ok, withSupabase } from "@/shared/api/handler";
import {
  POLL_SELECT,
  assemblePollListItems,
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

    // 선택지·득표·좋아요·내 투표를 조합한 리스트아이템 조립 (home/detail 공용 헬퍼)
    const items = await assemblePollListItems(supabase, polls, user?.id ?? null);
    if (!items) return fail(500, "투표 목록을 불러오지 못했어요.");

    return ok<PollListItem[]>(items);
  });
}
