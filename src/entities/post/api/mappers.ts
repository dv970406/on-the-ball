import { toPlainSummary } from "../lib/plain-summary";
import type {
  PostDetail,
  PostLikeRow,
  PostListItem,
  PostRow,
  ProfileRow,
} from "../model/types";

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
const AUTHOR_EMBED = "author:author_id(nickname)";
// post_like는 SELECT 정책이 "내 행만"이라 결과 배열이 곧 "내가 눌렀는지"다
const MY_LIKE_EMBED = "post_like(user_id)";

// ⚠ 목록은 content가 아니라 **excerpt**(generated column = content의 앞 300자)를 받는다.
//   content(최대 20000자)를 30건 실어 보내면 최악 600KB다.
export const POST_LIST_SELECT = `${BASE_COLUMNS}, excerpt, ${AUTHOR_EMBED}, ${MY_LIKE_EMBED}`;
// 상세는 본문 전체가 필요하다. excerpt는 content에서 파생하므로 여기서 다시 받지 않는다.
export const POST_DETAIL_SELECT = `${BASE_COLUMNS}, content, ${AUTHOR_EMBED}, ${MY_LIKE_EMBED}`;

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
  author: Pick<ProfileRow, "nickname"> | null;
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
  return { ...mapBase(row), content: row.content ?? "" };
}

/** 수정된 글인지 — created_at과 updated_at이 다르면 수정됨 (트리거가 서버 시각으로 찍는다) */
export function isEdited(post: Pick<PostListItem, "createdAt" | "updatedAt">) {
  return post.updatedAt !== post.createdAt;
}
