import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { PostListFilters } from "../model/types";
import { POST_LIST_LIMIT, POST_LIST_SELECT } from "./mappers";

/**
 * 목록 조회 쿼리의 **단일 소스** — 말머리 필터·정렬·상한이 여기 한 곳에만 있다.
 *
 * ⚠ **서버 프리페치와 클라이언트 훅이 같은 함수를 부른다.** 정렬 분기가 훅 안에만 있으면
 *   서버가 다른 순서를 만들고, 하이드레이션 직후 목록이 재배열된다(`nextjs.md`).
 *   `"use client"`를 붙이지 않는 이유도 그것이다 — 서버가 import해야 한다.
 *
 * ⚠ 삭제된 글은 RLS(`post_select_visible`)가 걸러주므로 `.is("deleted_at", null)`을 붙이지
 *   않는다. **차단한 사용자의 글도 같은 정책이 감춘다.** 게다가 정책은 `.limit()` **이전에**
 *   거르므로 목록이 늘 상한만큼 채워진다(클라이언트에서 걷어내면 페이지가 쪼그라들고 그
 *   자리를 채울 방법이 없다).
 */
export function buildPostListQuery(
  supabase: SupabaseClient<Database>,
  filters: PostListFilters,
) {
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

  return query.order("id", { ascending: false }).limit(POST_LIST_LIMIT);
}
