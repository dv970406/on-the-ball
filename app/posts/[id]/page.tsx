import { cache } from "react";
import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
// proxy(서버 가드)·수정 페이지와 같은 파서를 공유한다 — post-id 주석 참고
import { parsePostId } from "@/shared/lib/post-id";
import { createSupabaseServerClient } from "@/shared/api/supabase-server";
import { PostDetailView } from "@/views/post-detail";

const FALLBACK_METADATA: Metadata = { title: "게시글" };

/** <title>·og:title에 실을 최대 길이 — 원문을 그대로 넣으면 120자 제목이 통째로 들어간다 */
const META_TITLE_MAX = 60;
/** 공유 프리뷰 설명 길이 — 대부분의 플랫폼이 이 언저리에서 자른다 */
const META_DESCRIPTION_MAX = 120;

/** 글이 존재하는지 + 제목·본문 요약을 확인한 결과 */
type PostHead =
  | { state: "found"; title: string; content: string }
  | { state: "missing" }
  /** 조회 자체가 실패 — 일시 장애로 멀쩡한 글을 없다고 단정하면 안 되므로 구분한다 */
  | { state: "unknown" };

/** 길면 말줄임 — 잘린 자리에 …를 남겨 원문이 더 있음을 알린다 */
function clamp(text: string, max: number): string {
  const chars = [...text.trim()];
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("")}…`;
}

/**
 * 마크다운 원문 → 공유 프리뷰용 한 줄 요약.
 * 렌더러를 돌리지 않고 기호만 걷어낸다(서버에서 react-markdown을 태울 이유가 없다).
 */
function toPlainSummary(markdown: string): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, " ") // 펜스 코드블록
    .replace(/`([^`]*)`/g, "$1") // 인라인 코드
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // 이미지
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // 링크는 텍스트만
    .replace(/^\s{0,3}>+\s?/gm, "") // 인용
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // 헤딩
    .replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, "") // 목록 마커
    .replace(/^\s{0,3}([-*_])\s*(\1\s*){2,}$/gm, " ") // 수평선
    .replace(/[*_~]/g, "") // 강조 기호
    .replace(/\s+/g, " ");
  return clamp(plain, META_DESCRIPTION_MAX);
}

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

    // 삭제된 글은 RLS(post_select_alive)가 걸러내므로 여기서도 자동으로 "없음"이 된다
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
  if (head.state !== "found") return FALLBACK_METADATA;

  const title = clamp(head.title, META_TITLE_MAX);
  const description = toPlainSummary(head.content);

  return {
    title,
    description,
    openGraph: {
      type: "article",
      title,
      description,
      siteName: "온더볼",
    },
    twitter: { card: "summary", title, description },
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
