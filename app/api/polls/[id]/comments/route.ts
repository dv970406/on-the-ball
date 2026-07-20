import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok, withSupabase } from "@/shared/api/handler";
import {
  COMMENT_SELECT,
  mapComment,
  resolvePollIdBySlug,
  type CommentRow,
} from "@/entities/poll/api/mappers";
import type { PollComment } from "@/entities/poll/model/types";

/**
 * GET /api/polls/[id]/comments — "한 줄 거들기" 댓글 목록 (최신순)
 * likes = seed_likes + comment_likes 카운트, likedByMe/isMine은 세션 기준.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: slug } = await params;

  return withSupabase(async ({ supabase, user }) => {
    const pollId = await resolvePollIdBySlug(supabase, slug);
    if (pollId === null) return fail(404, "투표를 찾을 수 없어요.");

    const { data, error } = await supabase
      .from("comments")
      .select(COMMENT_SELECT)
      .eq("poll_id", pollId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      // 응답 크기 상한 — 인기 폴의 댓글 누적 방어. 커서 페이지네이션은 후속 과제.
      .limit(50);
    if (error) return fail(500, "댓글을 불러오지 못했어요.");

    const rows = (data ?? []) as unknown as CommentRow[];
    return ok<PollComment[]>(rows.map((row) => mapComment(row, user?.id ?? null)));
  });
}

const bodySchema = z.object({
  body: z.string().trim().min(1).max(500),
});

/**
 * POST /api/polls/[id]/comments — 댓글 작성 (body: { body }, 1~500자)
 * "투표한 사람만 댓글 작성"은 RLS(comments_insert_voter_only)가 강제 — 위반 시 403.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: slug } = await params;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return fail(400, "댓글은 1~500자로 입력해 주세요.");

  return withSupabase(async ({ supabase, user }) => {
    if (!user) return fail(401, "로그인 세션이 필요해요.");

    const pollId = await resolvePollIdBySlug(supabase, slug);
    if (pollId === null) return fail(404, "투표를 찾을 수 없어요.");

    const { data, error } = await supabase
      .from("comments")
      .insert({ poll_id: pollId, user_id: user.id, body: parsed.data.body })
      .select(
        "id, user_id, display_name, display_tag, body, seed_likes, created_at, profiles!comments_user_id_fkey(nickname, fan_team)",
      )
      .single();

    if (error) {
      // 42501 = RLS 위반 — 이 투표에 참여하지 않은 사용자
      if (error.code === "42501") {
        return fail(403, "투표한 뒤에 댓글을 남길 수 있어요.");
      }
      // 23503 = FK 위반 — 존재하지 않는 투표
      if (error.code === "23503") return fail(404, "투표를 찾을 수 없어요.");
      return fail(500, "댓글 등록 중 오류가 발생했어요.");
    }

    // 방금 작성한 댓글 — 동감은 아직 0개
    const row = {
      ...(data as unknown as Omit<CommentRow, "comment_likes">),
      comment_likes: [],
    } as CommentRow;

    return ok<PollComment>(mapComment(row, user.id), { status: 201 });
  });
}
