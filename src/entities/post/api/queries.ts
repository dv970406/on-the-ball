"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import type { PostListFilters, PostListPage } from "../model/types";
import { postKeys } from "./keys";
import {
  POST_DETAIL_SELECT,
  POST_LIST_SELECT,
  buildPostDetail,
  buildPostListItem,
} from "./mappers";

/**
 * 목록에 한 번에 가져올 글 수 — 페이지네이션은 아직 없다.
 *
 * ⚠ 화면이 **잘렸다는 사실을 사용자에게 알려야 한다**(댓글 목록이 이미 그렇게 하고 있다).
 *   조용히 자르면 31번째 글부터는 URL을 아는 사람 말고는 도달할 방법이 없다.
 */
export const POST_LIST_LIMIT = 30;

/**
 * 게시글 목록 (말머리 필터 + 정렬).
 *
 * 삭제된 글은 RLS의 post_select_alive가 걸러주므로 .is("deleted_at", null)을 붙이지 않는다.
 * 필터를 쿼리마다 반복하면 한 곳만 빠뜨려도 삭제된 글이 새기 때문에, 정책에 박아 두었다.
 *
 * ⚠ placeholderData: 필터를 바꿀 때마다 새 캐시 키라 그냥 두면 isPending이 되어 스켈레톤이
 *   튄다("로딩 중 레이아웃이 튀지 않게 한다" — data-and-state.md).
 */
export function usePostListQuery(filters: PostListFilters) {
  return useQuery<PostListPage, Error>({
    queryKey: postKeys.list(filters),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      let query = supabase.from("post").select(POST_LIST_SELECT);

      if (filters.category !== null) query = query.eq("category", filters.category);

      // 정렬 키가 무엇이든 **마지막은 항상 id**다 — 동점이면 순서가 불안정해지고,
      // 페이지네이션을 붙이는 순간 경계에서 행 중복·누락으로 드러난다(댓글 목록과 같은 규약).
      if (filters.sort === "popular") {
        query = query
          .order("like_count", { ascending: false })
          .order("created_at", { ascending: false });
      } else if (filters.sort === "comments") {
        query = query
          .order("comment_count", { ascending: false })
          .order("created_at", { ascending: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      const { data, error } = await query
        .order("id", { ascending: false })
        .limit(POST_LIST_LIMIT);

      if (error) {
        console.error("[post] 목록 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return { items: (data ?? []).map(buildPostListItem) };
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
