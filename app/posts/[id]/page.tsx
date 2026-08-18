import { cache } from "react";
import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
// proxy(서버 가드)·수정 페이지와 같은 파서를 공유한다 — post-id 주석 참고
import { parsePostId } from "@/shared/lib/post-id";
import { createSupabaseServerClient } from "@/shared/api/supabase-server";
// ⚠ 배럴(@/entities/post)이 아니라 직접 경로 — 배럴은 "use client" 모듈을 포함한다.
//   목록 카드의 발췌와 **같은 변환기**를 쓴다(둘이 갈리면 화면과 공유 프리뷰의 요약이 달라진다).
import { clamp, toPlainSummary } from "@/entities/post/lib/plain-summary";
import { PostDetailView } from "@/views/post-detail";

/** 조회 실패("unknown")로 화면은 띄우되 제목을 알 수 없을 때 */
const FALLBACK_METADATA: Metadata = { title: "게시글" };
/**
 * 없는 글 — `Page`가 `notFound()`를 부르므로 **404 화면과 같은 제목**이어야 한다.
 * ⚠ 이걸 `FALLBACK_METADATA`로 뭉뚱그리면 서버 HTML은 "페이지를 찾을 수 없어요"인데
 *   하이드레이션 후 탭 제목만 "게시글"로 바뀐다(실측). 문구는 `app/not-found.tsx`와 같이 간다.
 */
const NOT_FOUND_METADATA: Metadata = { title: "페이지를 찾을 수 없어요" };

/** <title>·og:title에 실을 최대 길이 — 원문을 그대로 넣으면 120자 제목이 통째로 들어간다 */
const META_TITLE_MAX = 60;
/** 공유 프리뷰 설명 길이 — 대부분의 플랫폼이 이 언저리에서 자른다 */
const META_DESCRIPTION_MAX = 120;

/**
 * 공유 카드 이미지 — 루트의 `app/opengraph-image.png`가 서빙되는 경로.
 *
 * 글마다 다른 이미지는 만들지 않는다: `ImageResponse`(satori)는 woff2를 읽지 못하는데
 * 이 프로젝트의 Pretendard는 woff2 동적 서브셋뿐이라, 한글 제목을 그리려면 한글 TTF를
 * 통째로 리포에 넣어야 한다. 카드의 제목·설명은 이미 글마다 다르므로 이미지만 공통으로 둔다.
 */
const OG_IMAGE = {
  url: "/opengraph-image.png",
  type: "image/png",
  width: 1200,
  height: 630,
  alt: "온더볼 — 모든 축구팬들을 위한 커뮤니티",
};

/** 글이 존재하는지 + 제목·본문 요약을 확인한 결과 */
type PostHead =
  | { state: "found"; title: string; content: string }
  | { state: "missing" }
  /** 조회 자체가 실패 — 일시 장애로 멀쩡한 글을 없다고 단정하면 안 되므로 구분한다 */
  | { state: "unknown" };

/**
 * generateMetadata와 Page가 같은 요청에서 함께 쓴다.
 * React cache로 감싸 요청당 1회만 실제 조회하게 한다(안 감싸면 매 요청 쿼리가 2번 나간다).
 *
 * ⚠ 서버 실행이라 "use client"를 포함한 배럴(@/entities/post)을 import하면 안 된다 →
 *   supabase-server만 직접 경로로 쓴다.
 */
const fetchPostHead = cache(async (postId: number): Promise<PostHead> => {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { state: "unknown" };

    // 삭제된 글은 RLS(post_select_visible)가 걸러내므로 여기서도 자동으로 "없음"이 된다.
    // ⚠ **차단한 작성자의 글도 같은 정책이 감춘다** — 쿠키 기반 서버 클라이언트라
    //   auth.uid()가 잡혀 서버·클라 판정이 갈리지 않는다(차단한 글은 그 사용자에게 404다).
    const { data, error } = await supabase
      .from("post")
      .select("title, content")
      .eq("id", postId)
      .maybeSingle();

    if (error) return { state: "unknown" };
    // 클라이언트에 Database가 붙어 있어 data.title은 이미 string으로 추론된다 — 단언하지 않는다
    // (단언을 넣으면 컬럼 타입이 바뀌어도 컴파일 에러가 안 나서 생성 타입을 쓰는 의미가 사라진다)
    return data
      ? { state: "found", title: data.title, content: data.content }
      : { state: "missing" };
  } catch (e) {
    // createSupabaseServerClient의 cookies()는 "이 라우트를 동적 렌더로 전환하라"는
    // Next 내부 에러를 throw해서 동작한다. 삼키면 페이지가 스켈레톤 상태로 정적
    // 프리렌더되어 조용히 망가지므로 반드시 되던진다.
    unstable_rethrow(e);
    console.error("[posts/[id]] 글 조회 실패:", e);
    return { state: "unknown" };
  }
});

/**
 * 공유 링크에 글 제목·요약이 보이도록 메타데이터를 서버에서 채운다 (실패해도 화면은 그대로 뜬다).
 *
 * ⚠ title만 채우면 **카카오톡·슬랙 등 링크 프리뷰는 달라지지 않는다** — 그쪽은
 *   og:title/og:description을 먼저 읽으므로, 모든 글이 루트 layout의 사이트 설명 하나로
 *   똑같이 미리보기됐다. 공유 버튼(SubHeader)이 있는 화면이라 실사용 경로다.
 */
export async function generateMetadata(props: PageProps<"/posts/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const postId = parsePostId(id);
  if (postId === null) return FALLBACK_METADATA;

  const head = await fetchPostHead(postId);
  if (head.state === "missing") return NOT_FOUND_METADATA;
  if (head.state !== "found") return FALLBACK_METADATA;

  const title = clamp(head.title, META_TITLE_MAX);
  const description = toPlainSummary(head.content, META_DESCRIPTION_MAX);

  return {
    title,
    description,
    openGraph: {
      type: "article",
      title,
      description,
      siteName: "온더볼",
      // ⚠ images를 여기서 **명시해야 한다.** 세그먼트가 openGraph를 직접 채우면
      //   루트 opengraph-image.png의 자동 주입이 통째로 대체되어 사라진다(실측 확인) —
      //   생략했더니 글 상세만 이미지 없는 카드로 나갔다.
      //   metadataBase가 절대 URL로 만들어 준다.
      images: OG_IMAGE,
    },
    twitter: { card: "summary_large_image", title, description, images: OG_IMAGE },
  };
}

export default async function Page(props: PageProps<"/posts/[id]">) {
  const { id } = await props.params;
  const postId = parsePostId(id);
  if (postId === null) notFound();

  // ⚠ notFound()는 반드시 여기(세그먼트 렌더)에서 불러야 404가 나간다.
  //   generateMetadata에서 부르면 메타데이터 생성만 중단되고 응답은 200으로 나간다.
  const head = await fetchPostHead(postId);
  if (head.state === "missing") notFound();

  // state가 "unknown"이면 404로 단정하지 않고 화면을 띄운다 —
  // 클라이언트 쿼리가 다시 시도해 성공하거나 에러 상태를 보여준다.
  return <PostDetailView postId={postId} />;
}
