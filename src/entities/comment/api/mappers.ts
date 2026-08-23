import type { Database } from "@/types/database.types";
import type { Comment, CommentRow } from "../model/types";

/**
 * 한 글에 한 번에 가져올 댓글 수.
 * 없으면 댓글이 몰린 글에서 응답이 무한히 커진다(글 목록은 30개로 끊고 있다).
 * 페이지네이션이 필요해지면 여기서부터 확장한다.
 *
 * ⚠ **`api/queries.ts`가 아니라 여기 있다.** 그 파일은 `"use client"`라 서버가 import할 수
 *   없는데, 상세 페이지의 SSR 프리페치가 같은 상한을 써야 한다 — 두 곳에 숫자를 적으면
 *   서버가 200개를 보내고 클라이언트가 다른 수로 리페치하는 순간 목록이 흔들린다.
 */
export const COMMENT_LIST_LIMIT = 200;

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
