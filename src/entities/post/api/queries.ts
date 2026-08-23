"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import type { PostDetail, PostListFilters, PostListPage } from "../model/types";
import { postKeys } from "./keys";
import { POST_DETAIL_SELECT, buildPostDetail, buildPostListItem } from "./mappers";
import { buildPostListQuery } from "./list-query";

/**
 * 게시글 목록 (말머리 필터 + 정렬).
 *
 * 삭제된 글은 RLS의 post_select_visible이 걸러주므로 .is("deleted_at", null)을 붙이지 않는다.
 * **차단한 사용자의 글도 같은 정책이 감춘다** — 그래서 여기에 차단 필터도 없다.
 * 게다가 정책은 `.limit()` **이전에** 거르므로 목록이 늘 30개로 채워진다(클라이언트에서
 * 걷어내면 페이지가 쪼그라들고 그 자리를 채울 방법이 없다).
 * 필터를 쿼리마다 반복하면 한 곳만 빠뜨려도 삭제된 글이 새기 때문에, 정책에 박아 두었다.
 *
 * ⚠ placeholderData: 필터를 바꿀 때마다 새 캐시 키라 그냥 두면 isPending이 되어 스켈레톤이
 *   튄다("로딩 중 레이아웃이 튀지 않게 한다" — data-and-state.md).
 * ⚠ `initialData`는 **서버 프리페치의 결과**다(SEO). 넘어오면 즉시 success가 되어
 *   서버가 그린 HTML과 첫 렌더가 같은 값을 본다 — 그때 `isPlaceholderData`는 false다.
 *   ⚠ **서버가 넘긴 `filters` 객체가 클라이언트와 정확히 같아야** 키 해시가 맞는다.
 */
export function usePostListQuery(filters: PostListFilters, initialData?: PostListPage) {
  return useQuery<PostListPage, Error>({
    initialData,
    queryKey: postKeys.list(filters),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // ⚠ 쿼리 조립은 `buildPostListQuery`가 단독으로 소유한다 — 서버 프리페치가 같은
      //   함수를 부르지 않으면 하이드레이션 직후 목록이 재배열된다.
      const { data, error } = await buildPostListQuery(requireBrowserSupabase(), filters);

      if (error) {
        console.error("[post] 목록 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return { items: (data ?? []).map(buildPostListItem) };
    },
  });
}

/** 게시글 상세 — 없거나 삭제된 글이면 null을 돌려준다(화면이 notFound 처리) */
/**
 * ⚠ `initialData`는 **서버 프리페치의 결과**다(SEO). 넘어오면 쿼리가 즉시 success가 되어
 *   로딩 분기를 타지 않고, 서버가 그린 HTML과 첫 렌더가 같은 값을 본다.
 *   ⚠ 프리페치가 실패하면 `undefined`가 오고 평소대로 클라이언트가 조회한다.
 */
export function usePostQuery(postId: number, initialData?: PostDetail) {
  return useQuery({
    initialData,
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
