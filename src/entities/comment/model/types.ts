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
  createdAt: CommentRow["created_at"];
}
