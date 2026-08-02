import { cache } from "react";
import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
// proxy(서버 가드)·수정 페이지와 같은 파서를 공유한다 — post-id 주석 참고
import { parsePostId } from "@/shared/lib/post-id";
import { createSupabaseServerClient } from "@/shared/api/supabase-server";
import { PostDetailView } from "@/views/post-detail";

const FALLBACK_METADATA: Metadata = { title: "게시글 · 온더볼" };

/** 글이 존재하는지 + 제목만 확인한 결과 */
type PostHead =
  | { state: "found"; title: string }
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

    // 삭제된 글은 RLS(post_select_alive)가 걸러내므로 여기서도 자동으로 "없음"이 된다
    const { data, error } = await supabase
      .from("post")
      .select("title")
      .eq("id", postId)
      .maybeSingle();

    if (error) return { state: "unknown" };
    // 클라이언트에 Database가 붙어 있어 data.title은 이미 string으로 추론된다 — 단언하지 않는다
    // (단언을 넣으면 컬럼 타입이 바뀌어도 컴파일 에러가 안 나서 생성 타입을 쓰는 의미가 사라진다)
    return data ? { state: "found", title: data.title } : { state: "missing" };
  } catch (e) {
    // createSupabaseServerClient의 cookies()는 "이 라우트를 동적 렌더로 전환하라"는
    // Next 내부 에러를 throw해서 동작한다. 삼키면 페이지가 스켈레톤 상태로 정적
    // 프리렌더되어 조용히 망가지므로 반드시 되던진다.
    unstable_rethrow(e);
    console.error("[posts/[id]] 글 조회 실패:", e);
    return { state: "unknown" };
  }
});

/** 공유 링크에 글 제목이 보이도록 <title>을 서버에서 채운다 (실패해도 화면은 그대로 뜬다) */
export async function generateMetadata(props: PageProps<"/posts/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const postId = parsePostId(id);
  if (postId === null) return FALLBACK_METADATA;

  const head = await fetchPostHead(postId);
  return head.state === "found" ? { title: `${head.title} · 온더볼` } : FALLBACK_METADATA;
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
