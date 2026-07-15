import type { NextRequest } from "next/server";
import { fail, ok, withSupabase } from "@/shared/api/handler";

/**
 * POST /api/comments/[id]/likes — 동감 토글
 * 내 comment_likes 행이 있으면 delete, 없으면 insert → { liked } 반환.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // comments.id는 bigint — 숫자가 아니면 조회 없이 차단
  const commentId = Number(id);
  if (!Number.isInteger(commentId) || commentId <= 0) {
    return fail(400, "올바르지 않은 댓글이에요.");
  }

  return withSupabase(async ({ supabase, user }) => {
    if (!user) return fail(401, "로그인 세션이 필요해요.");

    const { data: existing, error: selectError } = await supabase
      .from("comment_likes")
      .select("comment_id")
      .eq("comment_id", commentId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (selectError) return fail(500, "동감 처리 중 오류가 발생했어요.");

    if (existing) {
      // 이미 눌렀으면 해제
      const { error } = await supabase
        .from("comment_likes")
        .delete()
        .eq("comment_id", commentId)
        .eq("user_id", user.id);
      if (error) return fail(500, "동감 처리 중 오류가 발생했어요.");
      return ok<{ liked: boolean }>({ liked: false });
    }

    const { error: insertError } = await supabase
      .from("comment_likes")
      .insert({ comment_id: commentId, user_id: user.id });
    if (insertError) {
      // 23503 = FK 위반 — 존재하지 않는 댓글
      if (insertError.code === "23503") return fail(404, "댓글을 찾을 수 없어요.");
      // 23505 = 유니크 충돌 — 동시 요청으로 이미 눌린 상태
      if (insertError.code === "23505") return ok<{ liked: boolean }>({ liked: true });
      return fail(500, "동감 처리 중 오류가 발생했어요.");
    }

    return ok<{ liked: boolean }>({ liked: true });
  });
}
