import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { COMMENT_LIST_LIMIT, COMMENT_SELECT } from "./mappers";

/**
 * 댓글 목록 쿼리 조립의 **단일 소스** — 훅과 SSR 페이지가 같은 함수를 부른다.
 *
 * ⚠ **정렬을 양쪽이 따로 적으면 안 된다.** 상수(select·상한)만 공유하고 `order`를 각자
 *   적어 두면 어긋날 표면이 그대로 남는다 — 하이드레이션 직후 목록이 재배열된다.
 * ⚠ 최신 N개를 받아 **화면에서 뒤집는다**(오래된 것이 위). 그 `reverse()`도 한 곳이
 *   소유해야 해서 `buildCommentList`가 매핑까지 함께 한다.
 */
export function buildCommentListQuery(supabase: SupabaseClient<Database>, postId: number) {
  return (
    supabase
      .from("comment")
      .select(COMMENT_SELECT)
      .eq("post_id", postId)
      // ⚠ `asc + limit`으로 하면 상한을 넘긴 순간 **새 댓글이 통째로 안 보인다** —
      //   방금 단 사람에게 "등록됐다는데 내 댓글이 없다"가 된다. 잘리는 쪽은 과거여야 한다.
      // ⚠ id를 2차 정렬키로 둔다 — 같은 created_at이 여러 건이면 순서가 불안정해진다.
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(COMMENT_LIST_LIMIT)
  );
}
