import type { Database } from "@/types/database.types";
import type { Comment, CommentRow } from "../model/types";

// post와 달리 comment → profiles 경로는 하나뿐이라 모호하지 않지만,
// 같은 이유(임베딩 별칭을 뜻이 드러나게)로 FK 컬럼명을 명시한다.
// ⚠ **profiles 컬럼을 여기에 추가하면 `features/update-profile`의 무효화 대상도 늘려야 한다.**
//   프로필을 바꿔도 이 캐시는 저절로 갱신되지 않아 옛 값이 남는다(avatar_path가 그 선례다).
export const COMMENT_SELECT =
  "id, post_id, user_id, content, parent_id, created_at, author:user_id(nickname, avatar_path)";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/** COMMENT_SELECT가 돌려주는 행의 형태 — 컬럼 타입은 생성 타입에서 뽑는다 */
type CommentSelectRow = Pick<
  CommentRow,
  "id" | "post_id" | "user_id" | "content" | "parent_id" | "created_at"
> & {
  author: Pick<ProfileRow, "nickname" | "avatar_path"> | null;
};

export function buildComment(row: CommentSelectRow): Comment {
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    authorNickname: row.author?.nickname ?? "알 수 없음",
    // 경로만 담는다 — URL 조립은 화면이 avatarUrl()로 한다(호스트가 환경마다 다르다)
    authorAvatarPath: row.author?.avatar_path ?? null,
    content: row.content,
    parentId: row.parent_id,
    createdAt: row.created_at,
  };
}
