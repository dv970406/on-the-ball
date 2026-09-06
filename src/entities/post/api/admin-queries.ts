"use client";

import { useQuery } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { postKeys } from "./keys";
import {
  ADMIN_POST_DETAIL_SELECT,
  ADMIN_POST_LIMIT,
  ADMIN_POST_LIST_SELECT,
  type AdminPostRow,
  buildAdminPostListItem,
} from "./mappers";
import type { AdminPostDetail, AdminPostListItem } from "../model/types";

/**
 * 어드민 글 목록.
 *
 * ⚠ 테이블이 아니라 `admin_post_list` RPC를 부른다 — `post_select_visible`이 삭제된 글과
 *   차단한 작성자의 글을 감추기 때문이다. 어드민은 **차단과 무관하게** 전부 봐야 한다.
 */
export function useAdminPostListQuery(deleted: boolean | null) {
  return useQuery({
    queryKey: postKeys.adminList(deleted),
    queryFn: async (): Promise<AdminPostListItem[]> => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .rpc("admin_post_list", deleted === null ? {} : { p_deleted: deleted })
        .select(ADMIN_POST_LIST_SELECT)
        .order("id", { ascending: false })
        .limit(ADMIN_POST_LIMIT);

      if (error) {
        console.error("[post] 어드민 목록 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return (data ?? []).map((row) => buildAdminPostListItem(row as AdminPostRow));
    },
  });
}

export function useAdminPostQuery(postId: number) {
  return useQuery({
    queryKey: postKeys.adminDetail(postId),
    queryFn: async (): Promise<AdminPostDetail | null> => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .rpc("admin_post_list")
        .select(ADMIN_POST_DETAIL_SELECT)
        .eq("id", postId)
        .maybeSingle();

      if (error) {
        console.error("[post] 어드민 단건 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      if (!data) return null;
      const row = data as AdminPostRow & { content: string };
      return { ...buildAdminPostListItem(row), content: row.content };
    },
    enabled: Number.isSafeInteger(postId) && postId > 0,
  });
}
