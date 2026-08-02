// ⚠ 이 배럴은 "use client" 모듈(쿼리 훅·UI)을 포함한다 — 서버에서 import 금지.
//    서버(generateMetadata 등)에서는 서버 안전 경로를 직접 쓴다:
//      "@/entities/post/model/types", "@/entities/post/api/mappers", "@/entities/post/api/keys"
export type {
  PostListItem,
  PostDetail,
  // supabase 생성 타입에서 뽑은 DB 행 타입 (pnpm db:types)
  PostRow,
  PostInsert,
  PostUpdate,
} from "./model/types";
export { postKeys } from "./api/keys";
export {
  POST_LIST_SELECT,
  POST_DETAIL_SELECT,
  buildPostListItem,
  buildPostDetail,
  isEdited,
} from "./api/mappers";
export { usePostListQuery, usePostQuery } from "./api/queries";
export { PostCard } from "./ui/post-card";
