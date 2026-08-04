import type { Database } from "@/types/database.types";
import type { Comment, CommentRow } from "../model/types";

// post와 달리 comment → profiles 경로는 하나뿐이라 모호하지 않지만,
// 같은 이유(임베딩 별칭을 뜻이 드러나게)로 FK 컬럼명을 명시한다.
export const COMMENT_SELECT =
  "id, post_id, user_id, content, parent_id, created_at, author:user_id(nickname)";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/** COMMENT_SELECT가 돌려주는 행의 형태 — 컬럼 타입은 생성 타입에서 뽑는다 */
type CommentSelectRow = Pick<
  CommentRow,
  "id" | "post_id" | "user_id" | "content" | "parent_id" | "created_at"
> & {
  author: Pick<ProfileRow, "nickname"> | null;
};

export function buildComment(row: CommentSelectRow): Comment {
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    authorNickname: row.author?.nickname ?? "알 수 없음",
    content: row.content,
    parentId: row.parent_id,
    createdAt: row.created_at,
  };
}
