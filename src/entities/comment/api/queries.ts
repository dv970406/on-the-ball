"use client";

import { useQuery } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { commentKeys } from "./keys";
import { COMMENT_SELECT, buildComment } from "./mappers";

/**
 * 한 글에 한 번에 가져올 댓글 수.
 * 없으면 댓글이 몰린 글에서 응답이 무한히 커진다(글 목록은 30개로 끊고 있다).
 * 페이지네이션이 필요해지면 여기서부터 확장한다.
 */
export const COMMENT_LIST_LIMIT = 200;

/**
 * 한 글의 댓글 — 화면에는 오래된 순으로 보이지만 **최신 것부터 잘라 온다.**
 *
 * ⚠ `asc + limit`으로 하면 201번째부터는 오래된 200개만 남아 **새 댓글이 통째로 안 보인다.**
 *   방금 댓글을 단 사람에게 "등록됐다는데 내 댓글이 없다"가 되므로, 잘리는 쪽은 과거여야 한다.
 *   그래서 desc로 받아 화면 직전에 뒤집는다. 인덱스(post_id, created_at)는 양방향 모두 커버한다.
 */
export function useCommentListQuery(postId: number) {
  return useQuery({
    queryKey: commentKeys.list(postId),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .from("comment")
        .select(COMMENT_SELECT)
        .eq("post_id", postId)
        // id를 2차 정렬키로 둔다 — 같은 created_at이 여러 건이면 순서가 불안정해진다
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(COMMENT_LIST_LIMIT);

      if (error) {
        console.error("[comment] 목록 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      // 최신순으로 받아 오래된 순으로 되돌린다
      return (data ?? []).map(buildComment).reverse();
    },
    enabled: Number.isSafeInteger(postId) && postId > 0,
  });
}
