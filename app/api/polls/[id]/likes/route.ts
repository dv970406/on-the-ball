import type { NextRequest } from "next/server";
import { fail, ok, withSupabase } from "@/shared/api/handler";
import { resolvePollIdBySlug } from "@/entities/poll/api/mappers";

/**
 * POST /api/polls/[id]/likes — poll 좋아요 토글
 * 내 poll_likes 행이 있으면 delete, 없으면 insert → { liked } 반환.
 * ([id]는 slug — 정수 poll id로 해석)
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: slug } = await params;

  return withSupabase(async ({ supabase, user }) => {
    if (!user) return fail(401, "로그인 세션이 필요해요.");

    const pollId = await resolvePollIdBySlug(supabase, slug);
    if (pollId === null) return fail(404, "투표를 찾을 수 없어요.");

    const { data: existing, error: selectError } = await supabase
      .from("poll_likes")
      .select("poll_id")
      .eq("poll_id", pollId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (selectError) return fail(500, "좋아요 처리 중 오류가 발생했어요.");

    if (existing) {
      // 이미 눌렀으면 해제
      const { error } = await supabase
        .from("poll_likes")
        .delete()
        .eq("poll_id", pollId)
        .eq("user_id", user.id);
      if (error) return fail(500, "좋아요 처리 중 오류가 발생했어요.");
      return ok<{ liked: boolean }>({ liked: false });
    }

    const { error: insertError } = await supabase
      .from("poll_likes")
      .insert({ poll_id: pollId, user_id: user.id });
    if (insertError) {
      // 23503 = FK 위반 — 존재하지 않는 투표
      if (insertError.code === "23503") return fail(404, "투표를 찾을 수 없어요.");
      // 23505 = 유니크 충돌 — 동시 요청으로 이미 눌린 상태
      if (insertError.code === "23505") return ok<{ liked: boolean }>({ liked: true });
      return fail(500, "좋아요 처리 중 오류가 발생했어요.");
    }

    return ok<{ liked: boolean }>({ liked: true });
  });
}
