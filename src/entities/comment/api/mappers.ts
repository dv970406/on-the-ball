import type { Database } from "@/types/database.types";
import type { Comment, CommentList, CommentRow, CommentVote, CommentVoteRow } from "../model/types";

/**
 * 한 딜에 한 번에 가져올 댓글 수(루트 + 답글).
 * 없으면 댓글이 몰린 딜에서 응답이 무한히 커진다. 페이지네이션이 필요해지면 여기서부터 확장한다.
 *
 * ⚠ **`api/queries.ts`가 아니라 여기 있다.** 그 파일은 `"use client"`라 서버가 import할 수
 *   없는데, 상세 페이지의 SSR 프리페치가 같은 상한을 써야 한다 — 두 곳에 숫자를 적으면
 *   서버가 200개를 보내고 클라이언트가 다른 수로 리페치하는 순간 목록이 흔들린다.
 */
export const COMMENT_LIST_LIMIT = 200;

/**
 * ⚠ **select 문자열을 `+`로 잇지 않는다** — supabase-js가 리터럴 타입을 파싱해 결과 형태를 만든다.
 * ⚠ **profiles 컬럼을 여기에 추가하면 `features/update-profile`의 무효화 대상도 늘려야 한다.**
 *   프로필을 바꿔도 이 캐시는 저절로 갱신되지 않아 옛 값이 남는다.
 * ⚠ `my_vote`는 SELECT 정책이 "내 행만"이라 0~1개다 — 별도 필터를 잊어 남의 표가 새는 사고가
 *   구조적으로 불가능하다(`transfer_deal_watch(user_id)`와 같은 트릭).
 */
export const COMMENT_SELECT =
  "id, deal_id, user_id, content, parent_id, created_at, up_count, down_count, author:user_id(nickname, avatar_path), my_vote:transfer_deal_comment_vote(value)" as const;

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/** COMMENT_SELECT가 돌려주는 행의 형태 — 컬럼 타입은 생성 타입에서 뽑는다 */
export type CommentSelectRow = Pick<
  CommentRow,
  | "id"
  | "deal_id"
  | "user_id"
  | "content"
  | "parent_id"
  | "created_at"
  | "up_count"
  | "down_count"
> & {
  author: Pick<ProfileRow, "nickname" | "avatar_path"> | null;
  my_vote: Pick<CommentVoteRow, "value">[];
};

/** DB의 표 값(smallint) → 도메인 값. CHECK가 ±1만 받지만 모르는 값은 "표 없음"으로 접는다 */
function toVote(value: number | undefined): CommentVote {
  return value === 1 || value === -1 ? value : 0;
}

export function buildComment(row: CommentSelectRow): Comment {
  const myVote = toVote(row.my_vote[0]?.value);
  return {
    id: row.id,
    dealId: row.deal_id,
    userId: row.user_id,
    authorNickname: row.author?.nickname ?? "알 수 없음",
    // 경로만 담는다 — URL 조립은 화면이 avatarUrl()로 한다(호스트가 환경마다 다르다)
    authorAvatarPath: row.author?.avatar_path ?? null,
    content: row.content,
    parentId: row.parent_id,
    createdAt: row.created_at,
    upCount: row.up_count,
    downCount: row.down_count,
    myVote,
    fetchedVote: myVote,
  };
}

/**
 * 조회 결과(최신순, 상한 + 1건) → 화면용 목록(오래된 순, 상한까지).
 *
 * ⚠ **훅과 SSR 페이지가 이 함수 하나를 부른다.** 잘라 내기·뒤집기를 양쪽이 따로 하면 하이드레이션
 *   직후 목록이 흔들린다(조립을 `buildCommentListQuery`가 단독으로 갖는 것과 같은 이유).
 * ⚠ 최신순으로 받아 **과거 쪽을 자른다** — 오래된 순으로 받아 자르면 상한을 넘긴 순간 방금 단
 *   댓글이 통째로 안 보인다("등록됐다는데 내 댓글이 없다").
 */
export function buildCommentList(rows: CommentSelectRow[]): CommentList {
  const truncated = rows.length > COMMENT_LIST_LIMIT;
  return {
    comments: rows.slice(0, COMMENT_LIST_LIMIT).map(buildComment).reverse(),
    truncated,
  };
}
