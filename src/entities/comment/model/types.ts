import type { Database } from "@/types/database.types";

/**
 * 댓글 도메인 타입 (순수 — 서버에서도 import 가능).
 * DB 행 타입은 생성 타입에서 뽑는다(`pnpm db:types`).
 */
export type CommentRow = Database["public"]["Tables"]["comment"]["Row"];
export type CommentInsert = Database["public"]["Tables"]["comment"]["Insert"];

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export interface Comment {
  id: CommentRow["id"];
  postId: CommentRow["post_id"];
  userId: CommentRow["user_id"];
  /** profiles 임베딩에서 온다 */
  authorNickname: ProfileRow["nickname"];
  content: CommentRow["content"];
  /** null = 루트 댓글. 깊이는 DB 트리거(check_comment_depth)가 1로 제한한다 */
  parentId: CommentRow["parent_id"];
  createdAt: CommentRow["created_at"];
}

/** 루트 댓글 + 그 답글들. 깊이 1까지만이라 replies 안에 또 스레드가 들어가지 않는다 */
export interface CommentThread {
  comment: Comment;
  replies: Comment[];
}
