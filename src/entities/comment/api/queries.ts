"use client";

import { useQuery } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import type { Comment } from "../model/types";
import { commentKeys } from "./keys";
import { buildComment } from "./mappers";
import { buildCommentListQuery } from "./list-query";


/**
 * 한 글의 댓글 — 화면에는 오래된 순으로 보이지만 **최신 것부터 잘라 온다.**
 *
 * ⚠ `asc + limit`으로 하면 201번째부터는 오래된 200개만 남아 **새 댓글이 통째로 안 보인다.**
 *   방금 댓글을 단 사람에게 "등록됐다는데 내 댓글이 없다"가 되므로, 잘리는 쪽은 과거여야 한다.
 *   그래서 desc로 받아 화면 직전에 뒤집는다. 인덱스(post_id, created_at)는 양방향 모두 커버한다.
 */
/**
 * ⚠ `initialData`는 서버 프리페치의 결과다 — 사유·주의는 `usePostQuery`와 같다.
 *   ⚠ 서버가 **같은 조립**을 써야 한다 → `buildCommentListQuery`가 그 단일 소스다.
 */
export function useCommentListQuery(postId: number, initialData?: Comment[]) {
  return useQuery({
    initialData,
    queryKey: commentKeys.list(postId),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      // ⚠ 조립은 `buildCommentListQuery`가 단독으로 소유한다 — SSR 페이지가 같은 함수를 부른다
      const { data, error } = await buildCommentListQuery(supabase, postId);

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
