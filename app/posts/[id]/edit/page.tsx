import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
// proxy(서버 가드)와 같은 파서를 써야 판정이 어긋나지 않는다 — post-id 주석 참고.
// "use client" 훅을 포함한 @/shared/lib 배럴 대신 직접 경로로 가져온다.
import { parsePostId } from "@/shared/lib/post-id";
import { createSupabaseServerClient } from "@/shared/api/supabase-server";
import { AuthRequired } from "@/entities/session";
import { PostEditView } from "@/views/post-edit";

export const metadata: Metadata = {
  title: "글 수정",
  // 로그인 필수 + 개인 작업 화면이라 색인 대상이 아니다
  robots: { index: false, follow: false },
};

/**
 * 글이 존재하는지만 확인한다.
 *
 * ⚠ 이게 없으면 없는 글·삭제된 글의 수정 URL이 **200으로 응답한다** — 같은 리소스인데
 *   `/posts/999`는 404이고 `/posts/999/edit`는 200이라 판정이 갈렸다(실측).
 *
 * ⚠ 요청 API(cookies)를 try/catch로 감쌌으므로 `unstable_rethrow`가 필수다 —
 *   Next 내부의 "동적 렌더로 전환" 에러를 삼키면 이 라우트가 조용히 정적 프리렌더된다.
 *   조회 실패("unknown")와 글 없음을 구분한다. 일시 장애로 멀쩡한 글을 404로 단정하지 않는다.
 */
async function findPost(postId: number): Promise<"found" | "missing" | "unknown"> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return "unknown";

    // 삭제된 글은 RLS(post_select_visible)가 걸러내므로 자동으로 "없음"이 된다
    // (차단한 작성자의 글도 같은 정책이 감춘다 — 남의 글은 어차피 수정할 수 없다)
    const { data, error } = await supabase
      .from("post")
      .select("id")
      .eq("id", postId)
      .maybeSingle();

    if (error) return "unknown";
    return data ? "found" : "missing";
  } catch (e) {
    unstable_rethrow(e);
    console.error("[posts/[id]/edit] 글 확인 실패:", e);
    return "unknown";
  }
}

export default async function Page(props: PageProps<"/posts/[id]/edit">) {
  const { id } = await props.params;
  const postId = parsePostId(id);
  if (postId === null) notFound();

  if ((await findPost(postId)) === "missing") notFound();

  // "unknown"이면 화면을 띄운다 — 클라이언트 쿼리가 다시 시도해 성공하거나 에러를 보여준다.
  // 수정 권한 판정은 화면(안내)과 RLS(실차단)가 맡는다.
  return (
    <AuthRequired>
      <PostEditView postId={postId} />
    </AuthRequired>
  );
}
