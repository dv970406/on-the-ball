/**
 * 글 상세의 구조화 데이터(schema.org `DiscussionForumPosting`).
 *
 * 순수 함수라 서버 page가 직접 경로로 가져간다("use client" 없음 — 이 슬라이스의 배럴은
 * 클라이언트 뷰를 담고 있어 서버 소비자는 거칠 수 없다, `architecture.md`).
 *
 * **왜 `Article`이 아니라 `DiscussionForumPosting`인가.** 구글 문서가 유형을 콘텐츠의 성격으로
 * 가른다 — 발행인이 쓴 글은 `Article`, **사용자가 올리고 다른 사용자가 답하는 글**은
 * `DiscussionForumPosting`이다(Q&A 구조는 또 따로 `QAPage`). 이 앱의 글은 후자이고, 댓글을
 * `comment`로 중첩해 스레드 전체를 한 덩어리로 설명한다.
 *
 * ⚠ **화면에 보이는 것만 적는다**(구글 구조화 데이터 일반 정책). 본문·댓글·좋아요·조회수·댓글
 *   수는 전부 이 화면이 그리는 값이다. 그래서 댓글은 **서버가 SSR한 목록**(최신
 *   `COMMENT_LIST_LIMIT`건)만 싣고, 전체 수는 `commentCount`가 따로 말한다 — 문서가 정확히 그
 *   용도로 두 값을 가른다("markup되지 않은 댓글이 있을 때의 총합").
 * ⚠ **이미지는 본문에 있을 때만.** 문서가 "기본·아이콘·플레이스홀더·작성자 이미지를 넣지 말라"고
 *   못박는다 — `og:image`가 브랜드 이미지로 폴백하는 것과 갈리는 지점이다.
 * ⚠ `text`는 **평문**이다. 마크다운 기호를 걷어낸 본문을 통째로 싣는다(문서는 요약이 아니라
 *   본문을 기대한다). 발췌·`og:description`과 **같은 변환기**라 세 곳의 문장이 갈리지 않는다.
 *   대가로 HTML이 본문만큼 한 번 더 무거워지는데, 문서가 그 이유로 권하는 Microdata는
 *   마크업이 본문·댓글·액션 바 세 컴포넌트에 흩어져 한 곳에서 검증할 수 없다 → JSON-LD를 택한다.
 * ⚠ `author.url`이 없다. 이 앱에는 남의 프로필 화면이 없다(`/profile`은 자기 것뿐이다).
 */
import { ROUTES, absoluteUrl } from "@/shared/config";
import { clamp } from "@/shared/lib/text";
import type { JsonLdObject } from "@/shared/ui/json-ld";
import { isEdited } from "@/entities/post/api/mappers";
import { toPlainSummary } from "@/entities/post/lib/plain-summary";
import type { PostDetail } from "@/entities/post/model/types";
import { buildCommentThreads } from "@/entities/comment/lib/build-comment-threads";
import type { Comment } from "@/entities/comment/model/types";

/**
 * `headline` 상한. schema.org·구글이 요구하는 값은 아니지만 검색 결과의 제목 링크가 이 언저리에서
 * 잘리고, DB 한도(1,200 코드포인트)는 그보다 훨씬 넓다 — `<title>`을 클램프하는 것과 같은 이유.
 */
const HEADLINE_MAX = 110;

interface PostJsonLdInput {
  post: PostDetail;
  /** 서버가 SSR한 댓글(오래된 순). 조회가 실패했으면 `undefined` → 댓글 없이 싣는다 */
  comments: Comment[] | undefined;
  /** 본문의 이미지 URL(절대 URL만). 비어 있으면 `image`를 아예 넣지 않는다 */
  images: string[];
}

function interaction(type: string, count: number): JsonLdObject {
  return {
    "@type": "InteractionCounter",
    interactionType: `https://schema.org/${type}`,
    userInteractionCount: count,
  };
}

function commentNode(comment: Comment, replies: Comment[] = []): JsonLdObject {
  return {
    "@type": "Comment",
    text: comment.content,
    author: { "@type": "Person", name: comment.authorNickname },
    datePublished: comment.createdAt,
    ...(replies.length > 0 ? { comment: replies.map((reply) => commentNode(reply)) } : {}),
  };
}

export function buildPostJsonLd({ post, comments, images }: PostJsonLdInput): JsonLdObject {
  const url = absoluteUrl(ROUTES.post(post.id));
  const threads = buildCommentThreads(comments ?? []);
  // 사진만 올린 글은 평문이 빈 문자열이다 — 문서는 text·image·video 중 **하나**를 요구하므로
  // 그때는 `text`를 빼고 `image`가 그 자리를 채운다(빈 `text`는 "글이 있는데 비었다"로 읽힌다).
  const text = toPlainSummary(post.content, Infinity);

  return {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    // 이 URL은 글 하나를 다루는 페이지다(문서의 `mainEntityOfPage` 조건)
    mainEntityOfPage: url,
    url,
    headline: clamp(post.title, HEADLINE_MAX),
    // 말머리 — 화면의 칩이 그대로 보여주는 값이다
    articleSection: post.category,
    ...(text ? { text } : {}),
    ...(images.length > 0 ? { image: images } : {}),
    author: { "@type": "Person", name: post.authorNickname },
    datePublished: post.createdAt,
    // `updated_at`은 제목·본문이 바뀔 때만 움직인다(트리거 WHEN 절) — 화면의 "수정됨"과 같은 판정
    ...(isEdited(post) ? { dateModified: post.updatedAt } : {}),
    inLanguage: "ko",
    interactionStatistic: [
      interaction("LikeAction", post.likeCount),
      interaction("ViewAction", post.viewCount),
      interaction("CommentAction", post.commentCount),
    ],
    commentCount: post.commentCount,
    ...(threads.length > 0
      ? { comment: threads.map(({ comment, replies }) => commentNode(comment, replies)) }
      : {}),
  };
}
