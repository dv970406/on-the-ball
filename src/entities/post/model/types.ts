import type { Database } from "@/types/database.types";

/**
 * 게시글 도메인 타입 (순수 — "use client" 없음, 서버에서도 import 가능).
 *
 * DB 행 타입은 손으로 적지 않고 **생성 타입에서 뽑는다**(`pnpm db:types`).
 * 마이그레이션으로 컬럼 타입이 바뀌면 여기가 따라 바뀌고, 매퍼·화면에서 컴파일 에러로 드러난다.
 */
export type PostRow = Database["public"]["Tables"]["post"]["Row"];
export type PostInsert = Database["public"]["Tables"]["post"]["Insert"];
export type PostUpdate = Database["public"]["Tables"]["post"]["Update"];
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type PostLikeRow = Database["public"]["Tables"]["post_like"]["Row"];

/**
 * 목록 카드용 도메인 타입.
 * 화면은 camelCase를 쓰고 파생 필드(작성자 닉네임·isLiked)가 붙으므로 행과 1:1이 아니다.
 * 대신 **각 필드의 타입을 행에서 가져와** 스키마와의 연결을 유지한다.
 */
export interface PostListItem {
  id: PostRow["id"];
  authorId: PostRow["author_id"];
  /** profiles 임베딩에서 온다. 프로필이 없으면 "알 수 없음" */
  authorNickname: ProfileRow["nickname"];
  title: PostRow["title"];
  likeCount: PostRow["like_count"];
  commentCount: PostRow["comment_count"];
  /** 내가 좋아요를 눌렀는지 — post_like 임베딩의 길이로 판정 */
  isLiked: boolean;
  createdAt: PostRow["created_at"];
  updatedAt: PostRow["updated_at"];
}

/** 상세 화면 — 목록 항목에 본문(마크다운 원문)이 더해진다 */
export interface PostDetail extends PostListItem {
  content: PostRow["content"];
}
