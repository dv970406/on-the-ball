import { cache } from "react";
import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
// ⚠ **새 파서를 만들지 않는다.** 하는 일이 "URL의 [id] → 엄격한 십진수 id"라 게시글 전용이
//   아니고, 판정이 갈리면 `/notices/2`·`/notices/002`가 같은 공지의 별칭 URL이 된다.
import { parsePostId } from "@/shared/lib/post-id";
import { clamp } from "@/shared/lib/text";
import { NOT_FOUND_TITLE, OG_IMAGE, OG_SITE, ROUTES, absoluteUrl } from "@/shared/config";
// ⚠ 배럴(@/shared/ui)이 아니라 직접 경로 — 이 page는 "use client"를 담은 배럴을 하나도 거치지 않는다(architecture.md)
import { JsonLd } from "@/shared/ui/json-ld";
import { createSupabaseAnonClient } from "@/shared/api/supabase-anon";
// 마크다운 → 평문의 단일 소스(`views/notice-detail/lib/json-ld`가 같은 변환기를 쓴다)
import { toPlainSummary } from "@/entities/post/lib/plain-summary";
import { NOTICE_SELECT, buildNotice } from "@/entities/notice/api/mappers";
import type { Notice } from "@/entities/notice/model/types";
import { NoticeDetailView } from "@/views/notice-detail";
// ⚠ 배럴이 아니라 직접 경로 — 배럴은 "use client" 뷰를 담는다. 순수 함수라 서버에서 호출한다.
import { buildNoticeJsonLd } from "@/views/notice-detail/lib/json-ld";

const FALLBACK_METADATA: Metadata = { title: "공지사항" };
/** 없는 공지 — `Page`가 `notFound()`를 부르므로 **404 화면과 같은 제목**이어야 한다. */
const NOT_FOUND_METADATA: Metadata = { title: NOT_FOUND_TITLE };
const META_TITLE_MAX = 60;
/** 공유 프리뷰·검색 결과 설명 길이 — 글 상세와 같은 값 */
const META_DESCRIPTION_MAX = 120;

type NoticeHead =
  | { state: "found"; notice: Notice }
  | { state: "missing" }
  /** 조회 자체가 실패 — 일시 장애로 멀쩡한 공지를 없다고 단정하면 안 되므로 구분한다 */
  | { state: "unknown" };

/**
 * ⚠ `cache()`가 **필수다** — `generateMetadata`와 `Page`가 같은 데이터를 쓴다.
 * ⚠ 쿠키를 보지 않는다(목록과 같은 이유 — 공지에는 개인화가 없다).
 * ⚠ 노출 기간·삭제 판정을 여기서 다시 짜지 않는다. `notice_select_live` 정책이 단독으로
 *   갖고, 정책이 감춘 공지는 이 조회에 **0행**으로 와서 그대로 404가 된다.
 */
const fetchNoticeHead = cache(async (noticeId: number): Promise<NoticeHead> => {
  try {
    const supabase = createSupabaseAnonClient();
    if (!supabase) return { state: "unknown" };

    const { data, error } = await supabase
      .from("notice")
      .select(NOTICE_SELECT)
      .eq("id", noticeId)
      // 0행이 정상이다(없는 id · 노출 기간 밖) → single()이면 PGRST116이 에러로 섞인다
      .maybeSingle();

    if (error) return { state: "unknown" };
    if (!data) return { state: "missing" };
    return { state: "found", notice: buildNotice(data) };
  } catch (e) {
    unstable_rethrow(e);
    console.error("[notices/[id]] 공지 조회 실패:", e);
    return { state: "unknown" };
  }
});

export async function generateMetadata(props: PageProps<"/notices/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const noticeId = parsePostId(id);
  if (noticeId === null) return FALLBACK_METADATA;

  const head = await fetchNoticeHead(noticeId);
  if (head.state === "missing") return NOT_FOUND_METADATA;
  if (head.state !== "found") return FALLBACK_METADATA;

  // DB 한도(1,200 코드포인트)가 <title>보다 훨씬 넓어 클램프가 필요하다
  const title = clamp(head.notice.title, META_TITLE_MAX);
  // ⚠ 본문 요약을 `description`으로 싣는다 — 없으면 모든 공지가 루트의 사이트 소개 한 줄로
  //   똑같이 검색 결과·공유 카드에 나간다(글 상세에서 실측했던 것과 같은 결함).
  const description = toPlainSummary(head.notice.body, META_DESCRIPTION_MAX);

  return {
    title,
    description,
    alternates: { canonical: ROUTES.notice(noticeId) },
    openGraph: {
      ...OG_SITE,
      type: "article",
      title,
      description,
      // Next는 `og:url`을 canonical에서 만들어 주지 않는다 — 네이버가 읽는 값이라 명시한다
      url: absoluteUrl(ROUTES.notice(noticeId)),
      images: OG_IMAGE,
      // 화면의 `<time>`이 그리는 시각과 같은 값(`opensAt`) — JSON-LD의 `datePublished`와 한 쌍
      publishedTime: head.notice.opensAt,
      section: head.notice.type,
    },
    twitter: { card: "summary_large_image", title, description, images: OG_IMAGE },
  };
}

export default async function Page(props: PageProps<"/notices/[id]">) {
  const { id } = await props.params;
  const noticeId = parsePostId(id);
  if (noticeId === null) notFound();

  // ⚠ notFound()는 반드시 여기(세그먼트 렌더)에서 불러야 404가 나간다.
  //   generateMetadata에서 부르면 메타데이터 생성만 중단되고 응답은 200으로 나간다.
  const head = await fetchNoticeHead(noticeId);
  if (head.state === "missing") notFound();

  // "unknown"이면 404로 단정하지 않고 화면을 띄운다(클라이언트가 다시 조회한다)
  // ⚠ 구조화 데이터는 서버가 본문을 손에 쥔 경우에만 싣는다(글 상세와 같은 이유)
  return (
    <>
      {head.state === "found" && <JsonLd data={buildNoticeJsonLd(head.notice)} />}
      <NoticeDetailView
        noticeId={noticeId}
        initialNotice={head.state === "found" ? head.notice : undefined}
      />
    </>
  );
}
