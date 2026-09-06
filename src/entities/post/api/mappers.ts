import { toPlainSummary } from "../lib/plain-summary";
import type {
  AdminPostListItem,
  PostDetail,
  PostLikeRow,
  PostListItem,
  PostRow,
  ProfileRow,
} from "../model/types";

/**
 * 목록에 한 번에 가져올 글 수 — 페이지네이션은 아직 없다.
 *
 * ⚠ 화면이 **잘렸다는 사실을 사용자에게 알려야 한다**(댓글 목록이 이미 그렇게 하고 있다).
 *   조용히 자르면 31번째 글부터는 URL을 아는 사람 말고는 도달할 방법이 없다.
 *
 * ⚠ **`api/queries.ts`가 아니라 여기 있다.** 그 파일은 `"use client"`라 서버가 import할 수
 *   없는데, 목록 SSR 프리페치가 **같은 상한**을 써야 한다 — 두 곳에 숫자를 적으면 서버가
 *   30개를 보내고 클라이언트가 다른 수로 리페치하는 순간 목록이 흔들린다
 *   (`COMMENT_LIST_LIMIT`을 옮긴 것과 같은 이유).
 */
export const POST_LIST_LIMIT = 30;

/**
 * DB 행(snake_case) → 도메인 타입(camelCase) 변환.
 * 순수 함수라 서버에서도 import할 수 있다("use client" 없음).
 */

/** 목록 카드 발췌의 최대 길이 — 13px 2행 클램프에 맞춘 값(CSS가 최종 컷을 한다) */
const EXCERPT_MAX = 120;

/** 목록·상세가 공유하는 select 컬럼 목록 — 스키마가 바뀌면 여기 한 곳만 고친다 */
const BASE_COLUMNS =
  "id, author_id, category, title, like_count, comment_count, view_count, created_at, updated_at";

// ⚠ 그냥 `profiles(nickname)`이라고 쓰면 PGRST201로 실패한다 —
//   post → profiles 경로가 둘(author_id 직접 FK / post_like 경유 many-to-many)이라 모호하다.
//   FK 컬럼명(author_id)으로 경로를 지정하고 별칭 author를 붙여 뜻을 드러낸다.
// ⚠ **profiles 컬럼을 여기에 추가하면 `features/update-profile`의 무효화 대상도 늘려야 한다.**
//   프로필을 바꿔도 이 캐시는 저절로 갱신되지 않아 옛 값이 남는다(avatar_path가 그 선례다).
const AUTHOR_EMBED = "author:author_id(nickname)";
// ⚠ 아바타는 **상세에만** 싣는다. 목록 카드는 아바타를 그리지 않으므로(프로토타입에 자리가 없다)
//   30건마다 쓰이지 않을 컬럼을 실어 나를 이유가 없다.
const AUTHOR_EMBED_DETAIL = "author:author_id(nickname, avatar_path)";
// post_like는 SELECT 정책이 "내 행만"이라 결과 배열이 곧 "내가 눌렀는지"다
const MY_LIKE_EMBED = "post_like(user_id)";

// ⚠ 목록은 content가 아니라 **excerpt**(generated column = content의 앞 300자)를 받는다.
//   content(최대 20000자)를 30건 실어 보내면 최악 600KB다.
export const POST_LIST_SELECT = `${BASE_COLUMNS}, excerpt, ${AUTHOR_EMBED}, ${MY_LIKE_EMBED}`;
// 상세는 본문 전체가 필요하다. excerpt는 content에서 파생하므로 여기서 다시 받지 않는다.
export const POST_DETAIL_SELECT = `${BASE_COLUMNS}, content, ${AUTHOR_EMBED_DETAIL}, ${MY_LIKE_EMBED}`;

/**
 * 위 select가 돌려주는 행의 형태.
 * 컬럼 타입을 손으로 적지 않고 생성 타입(PostRow 등)에서 뽑아 스키마와 묶어 둔다.
 * to-one(author)은 객체, to-many(post_like)는 배열로 온다.
 */
type PostSelectRow = Pick<
  PostRow,
  | "id"
  | "author_id"
  | "category"
  | "title"
  | "like_count"
  | "comment_count"
  | "view_count"
  | "created_at"
  | "updated_at"
> & {
  /** 목록에만 온다 */
  excerpt?: PostRow["excerpt"];
  /** 상세에만 온다 */
  content?: PostRow["content"];
  author:
    | (Pick<ProfileRow, "nickname"> & {
        /** 상세에만 온다 (AUTHOR_EMBED_DETAIL) */
        avatar_path?: ProfileRow["avatar_path"];
      })
    | null;
  post_like: Pick<PostLikeRow, "user_id">[] | null;
};

/**
 * 목록·상세가 공유하는 필드.
 * ⚠ excerpt는 여기서 만들지 않는다 — 상세는 발췌를 쓰지 않는데 여기 두면
 *   상세 조회마다 본문 전체에 정규식 파이프라인이 돌고 결과가 버려진다.
 */
function mapBase(row: PostSelectRow): Omit<PostListItem, "excerpt"> {
  return {
    id: row.id,
    authorId: row.author_id,
    authorNickname: row.author?.nickname ?? "알 수 없음",
    category: row.category,
    title: row.title,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    viewCount: row.view_count,
    // post_like의 SELECT 정책이 "내 행만"이라 임베딩 결과에 남의 좋아요가 섞일 수 없다.
    // 별도 user_id 필터를 잊어 남의 좋아요가 새는 사고가 구조적으로 불가능하다.
    isLiked: (row.post_like?.length ?? 0) > 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buildPostListItem(row: PostSelectRow): PostListItem {
  // 입력은 DB의 excerpt(= content 앞 300자)라 파이프라인이 짧은 문자열만 훑는다
  return { ...mapBase(row), excerpt: toPlainSummary(row.excerpt ?? "", EXCERPT_MAX) };
}

export function buildPostDetail(row: PostSelectRow): PostDetail {
  return {
    ...mapBase(row),
    content: row.content ?? "",
    // 경로만 담는다 — URL 조립은 화면이 avatarUrl()로 한다(호스트가 환경마다 다르다)
    authorAvatarPath: row.author?.avatar_path ?? null,
  };
}

/** 수정된 글인지 — created_at과 updated_at이 다르면 수정됨 (트리거가 서버 시각으로 찍는다) */
export function isEdited(post: Pick<PostListItem, "createdAt" | "updatedAt">) {
  return post.updatedAt !== post.createdAt;
}

/*
 * 어드민 목록·관리 화면용 select·매퍼.
 *
 * ⚠ **`api/queries.ts`가 아니라 여기 있다.** 그 파일은 `"use client"`라 서버가 import할 수
 *   없는데, "snake_case ↔ camelCase 매핑은 `api/mappers.ts`(순수·서버 안전)에서"가 규약이다
 *   (`ADMIN_MATCH_SELECT`가 `entities/match`에서 같은 자리에 있다). 지금은 서버 소비자가
 *   없지만 형태가 갈리면 다음 사람이 어느 쪽을 따를지 알 수 없다.
 */
export const ADMIN_POST_LIMIT = 100;
const ADMIN_EXCERPT_MAX = 120;

/**
 * ⚠ **임베딩 경로를 컬럼명으로 못박는다** — `post → profiles`는 `author_id` 직접 FK와
 *   `post_like` 경유 두 경로가 있어 그냥 `profiles(nickname)`이면 PGRST201이다.
 * ⚠ 조각을 `+`로 잇지 않는다(리터럴 타입이 넓어지면 추론이 깨진다).
 */
const ADMIN_POST_BASE =
  "id, author_id, category, title, like_count, comment_count, view_count, created_at, updated_at, deleted_at, author:author_id(nickname)";
export const ADMIN_POST_LIST_SELECT = `${ADMIN_POST_BASE}, excerpt` as const;
export const ADMIN_POST_DETAIL_SELECT = `${ADMIN_POST_BASE}, excerpt, content` as const;

export interface AdminPostRow {
  id: number;
  author_id: string;
  category: AdminPostListItem["category"];
  title: string;
  excerpt: string;
  like_count: number;
  comment_count: number;
  view_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  author: { nickname: string } | null;
}

export function buildAdminPostListItem(row: AdminPostRow): AdminPostListItem {
  return {
    id: row.id,
    authorId: row.author_id,
    // ⚠ FK가 not null이라 항상 오지만 생성 타입이 nullable이다 — 여기서 throw하면
    //   프로필 하나가 이상할 때 목록 전체가 죽는다(buildTeam과 같은 판단).
    authorNickname: row.author?.nickname ?? "알 수 없음",
    category: row.category,
    title: row.title,
    excerpt: toPlainSummary(row.excerpt ?? "", ADMIN_EXCERPT_MAX),
    likeCount: row.like_count,
    commentCount: row.comment_count,
    viewCount: row.view_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}
