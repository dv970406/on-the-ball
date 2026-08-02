"use client";

import { useQuery } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { postKeys } from "./keys";
import {
  POST_DETAIL_SELECT,
  POST_LIST_SELECT,
  buildPostDetail,
  buildPostListItem,
} from "./mappers";

/** 목록 1페이지 크기 — 페이지네이션은 아직 없다 */
const LIST_LIMIT = 30;

/**
 * 게시글 목록.
 *
 * 삭제된 글은 RLS의 post_select_alive가 걸러주므로 .is("deleted_at", null)을 붙이지 않는다.
 * 필터를 쿼리마다 반복하면 한 곳만 빠뜨려도 삭제된 글이 새기 때문에, 정책에 박아 두었다.
 */
export function usePostListQuery() {
  return useQuery({
    queryKey: postKeys.list(),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .from("post")
        .select(POST_LIST_SELECT)
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT);

      if (error) {
        console.error("[post] 목록 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return (data ?? []).map(buildPostListItem);
    },
  });
}

/** 게시글 상세 — 없거나 삭제된 글이면 null을 돌려준다(화면이 notFound 처리) */
export function usePostQuery(postId: number) {
  return useQuery({
    queryKey: postKeys.detail(postId),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .from("post")
        .select(POST_DETAIL_SELECT)
        .eq("id", postId)
        // single()은 0행이면 PGRST116 에러를 던진다. "없음"은 에러가 아니라 정상 결과이므로
        // maybeSingle()로 받아 null과 진짜 에러를 구분한다.
        .maybeSingle();

      if (error) {
        console.error("[post] 상세 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return data ? buildPostDetail(data) : null;
    },
    enabled: Number.isSafeInteger(postId) && postId > 0,
  });
}
