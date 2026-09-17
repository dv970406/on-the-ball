/**
 * 공지 상세의 구조화 데이터(schema.org `Article`).
 *
 * 순수 함수라 서버 page가 직접 경로로 가져간다(`views/post-detail/lib/json-ld`와 같은 형태).
 *
 * 글 상세가 `DiscussionForumPosting`인 것과 갈리는 이유가 곧 유형의 기준이다 — 공지는
 * **운영진(발행인)이 쓰고 댓글이 없다** → 구글 문서가 `Article`로 두는 자리다.
 * 작성자·발행인은 사람이 아니라 사이트 자체라 `Organization`이다.
 *
 * ⚠ `datePublished`는 `opensAt`이다 — 화면의 `<time>`이 그 값을 그린다("보이는 것만 적는다").
 *   `createdAt`은 예약 공지에서 노출 전 시각이라 화면과 어긋난다.
 * ⚠ `dateModified`는 노출 뒤에 고쳤을 때만 싣는다. 노출 전에 고친 것은 독자에게 "수정"이 아니고,
 *   `datePublished`보다 앞선 `dateModified`는 검증기가 경고한다.
 * ⚠ `image`를 싣지 않는다 — 공지에 대표 이미지가 없고, 기본 이미지를 넣지 말라는 것이 문서다.
 */
import { ROUTES, absoluteUrl, env } from "@/shared/config";
import { clamp } from "@/shared/lib/text";
import type { JsonLdObject } from "@/shared/ui/json-ld";
// 마크다운 → 평문 변환기의 단일 소스. 이름이 `post`를 달고 있지만 본문 마크다운의 성질은 같다
// (같은 `Markdown` 렌더러가 그린다) — 변환기를 하나 더 두면 두 화면의 요약 규칙이 갈린다.
import { toPlainSummary } from "@/entities/post/lib/plain-summary";
import type { Notice } from "@/entities/notice/model/types";

const HEADLINE_MAX = 110;
const DESCRIPTION_MAX = 120;

export function buildNoticeJsonLd(notice: Notice): JsonLdObject {
  const url = absoluteUrl(ROUTES.notice(notice.id));
  const publisher = { "@type": "Organization", name: "온더볼", url: env.siteUrl };

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    mainEntityOfPage: url,
    url,
    headline: clamp(notice.title, HEADLINE_MAX),
    description: toPlainSummary(notice.body, DESCRIPTION_MAX),
    // 화면의 배지가 그대로 보여주는 값이다('필독' · '공지')
    articleSection: notice.type,
    datePublished: notice.opensAt,
    // ⚠ 문자열로 비교하지 않는다 — 소수점 초·오프셋 표기가 행마다 다를 수 있다
    ...(Date.parse(notice.updatedAt) > Date.parse(notice.opensAt)
      ? { dateModified: notice.updatedAt }
      : {}),
    author: publisher,
    publisher,
    inLanguage: "ko",
  };
}
