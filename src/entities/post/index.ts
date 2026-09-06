// ⚠ 이 배럴은 "use client" 모듈(쿼리 훅·UI)을 포함한다 — 서버에서 import 금지.
//    서버(generateMetadata 등)에서는 서버 안전 경로를 직접 쓴다:
//      "@/entities/post/model/types", "@/entities/post/api/mappers", "@/entities/post/api/keys",
//      "@/entities/post/lib/plain-summary", "@/entities/post/lib/hot"
export type {
  PostListItem,
  PostListPage,
  PostListFilters,
  PostDetail,
  PostCategory,
  PostSort,
  // supabase 생성 타입에서 뽑은 DB 행 타입 (pnpm db:types)
  PostRow,
  PostInsert,
  PostUpdate,
} from "./model/types";
export {
  POST_CATEGORIES,
  POST_SORTS,
  POST_SORT_LABEL,
  // ⚠ URL은 영구 계약이다 — 슬러그 판정은 categoryFromSlug가 단독으로 소유한다
  POST_CATEGORY_SLUG,
  categoryFromSlug,
  parsePostSort,
} from "./model/types";
export { postKeys } from "./api/keys";
export {
  POST_LIST_LIMIT,
  POST_LIST_SELECT,
  POST_DETAIL_SELECT,
  buildPostListItem,
  buildPostDetail,
  isEdited,
} from "./api/mappers";
export { toPlainSummary } from "./lib/plain-summary";
export { isHotPost, HOT_LIKE_THRESHOLD, HOT_WINDOW_MS } from "./lib/hot";
export { usePostListQuery, usePostQuery } from "./api/queries";
export { PostCard } from "./ui/post-card";

// 어드민 백오피스 — 삭제된 글·차단한 작성자의 글까지 본다
// ⚠ `AdminPostDetail`·`AdminPostListItem`은 올리지 않는다(슬라이스 밖 호출부가 0이다)
export { useAdminPostListQuery, useAdminPostQuery } from "./api/admin-queries";
