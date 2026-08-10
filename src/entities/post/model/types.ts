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
 * 말머리. DB의 post_category enum이 생성 타입에 유니온으로 떨어지므로 **손으로 적지 않는다**.
 * 값을 추가하려면 마이그레이션(alter type ... add value)이 먼저다.
 */
export type PostCategory = PostRow["category"];

/**
 * 칩 레일 노출 순서. 값 자체는 스키마에서 오지만 **순서는 디자인이 정한다**.
 * satisfies로 묶어 두어 enum에 없는 값을 적으면 컴파일 에러가 난다.
 */
export const POST_CATEGORIES = [
  "이적설",
  "경기",
  "선수",
  "유니폼",
  "잡담",
] as const satisfies readonly PostCategory[];

/**
 * ⚠ **반대 방향을 막는 검사다.** `satisfies`는 "없는 값을 적으면" 잡지만
 *   "enum에 있는 값을 빠뜨리면" 못 잡는다. 그대로 두면 `alter type ... add value`로
 *   말머리를 추가하고 위 배열에 안 넣었을 때 **칩 레일과 작성 폼에서 조용히 빠지고**,
 *   `z.enum(POST_CATEGORIES)`가 그 값을 거부해 수정도 막힌다.
 *   `POST_SORT_LABEL`은 `Record<PostSort, …>`라 망라성이 보장되는데 여기만 비대칭이었다.
 *
 * ⚠ **타입 별칭만 선언하면 아무것도 검사하지 못한다**(`type X = never`는 그냥 선언일 뿐이다).
 *   실제로 컴파일 에러를 내려면 그 타입에 **값을 할당**해야 한다. 처음에 별칭만 두었다가
 *   음성 대조(값을 일부러 빼고 tsc)로 무력함을 확인하고 이 형태로 바꿨다.
 *   `satisfies`는 반대 방향(없는 값)만 잡으므로 둘이 함께 있어야 양방향이 닫힌다.
 */
const _CATEGORIES_EXHAUSTIVE: Exclude<PostCategory, (typeof POST_CATEGORIES)[number]> extends never
  ? true
  : never = true;
void _CATEGORIES_EXHAUSTIVE;

/** 목록 정렬 — 화면의 "최신 / 인기 / 댓글순"에 1:1 대응 */
export const POST_SORTS = ["latest", "popular", "comments"] as const;
export type PostSort = (typeof POST_SORTS)[number];

/** 정렬 토글에 찍는 라벨. Record라 POST_SORTS에 값이 늘면 컴파일 에러로 드러난다 */
export const POST_SORT_LABEL: Record<PostSort, string> = {
  latest: "최신",
  popular: "인기",
  comments: "댓글순",
};

/**
 * 목록 쿼리의 필터. **그대로 queryKey에 들어간다.**
 *
 * ⚠ category가 null인 이유: JSON.stringify가 undefined 키를 통째로 떨어뜨려
 *   `{category: undefined, sort}`와 `{sort}`가 같은 해시가 된다. 두 호출부가 다른 객체를
 *   넘겨도 먼저 등록된 queryFn이 이기므로, "전체"는 null 하나로 고정한다.
 */
export interface PostListFilters {
  /** null = 전체 */
  category: PostCategory | null;
  sort: PostSort;
}

/**
 * 목록 카드용 도메인 타입.
 * 화면은 camelCase를 쓰고 파생 필드(작성자 닉네임·isLiked·excerpt)가 붙으므로 행과 1:1이 아니다.
 * 대신 **각 필드의 타입을 행에서 가져와** 스키마와의 연결을 유지한다.
 */
export interface PostListItem {
  id: PostRow["id"];
  authorId: PostRow["author_id"];
  /** profiles 임베딩에서 온다. 프로필이 없으면 "알 수 없음" */
  authorNickname: ProfileRow["nickname"];
  category: PostRow["category"];
  title: PostRow["title"];
  /** DB의 excerpt(마크다운 원문 프리픽스)에서 기호를 걷어낸 평문 — lib/plain-summary.ts */
  excerpt: string;
  likeCount: PostRow["like_count"];
  commentCount: PostRow["comment_count"];
  viewCount: PostRow["view_count"];
  /** 내가 좋아요를 눌렀는지 — post_like 임베딩의 길이로 판정 */
  isLiked: boolean;
  createdAt: PostRow["created_at"];
  updatedAt: PostRow["updated_at"];
  // ⚠ isHot은 필드로 두지 않는다 — 시간에 따라 변하는 값이라 캐시에 얼면 안 된다. lib/hot.ts 참고
}

/**
 * 목록 응답.
 *
 * ⚠ total은 화면의 `N POSTS` 라벨 **전용**이다. "잘렸는지" 판정에 쓰지 않는다 —
 *   목록 배열과 서버 카운트는 리페치 시점이 달라 잘못된 안내가 뜬 적이 있다.
 *   잘림 판정은 items.length >= POST_LIST_LIMIT 하나로만 한다.
 */
export interface PostListPage {
  items: PostListItem[];
  total: number;
}

/**
 * 상세 화면 — 목록 항목에서 발췌를 빼고 본문(마크다운 원문)이 더해진다.
 *
 * ⚠ `excerpt`를 **일부러 상속하지 않는다.** 상세 화면은 발췌를 렌더하지 않는데
 *   타입이 필수로 요구하면 매퍼가 채울 수밖에 없고, 그러면 상세 조회마다 본문 전체
 *   (최대 20,000자)에 정규식 파이프라인을 돌려 결과를 버리게 된다.
 */
export interface PostDetail extends Omit<PostListItem, "excerpt"> {
  content: PostRow["content"];
  /**
   * 작성자 아바타의 **경로**(전체 URL이 아니다) — `avatarUrl()`로 조립한다.
   * ⚠ 목록에는 없다. 목록 카드가 아바타를 그리지 않아 select에서 뺐다(api/mappers.ts).
   */
  authorAvatarPath: ProfileRow["avatar_path"];
}
