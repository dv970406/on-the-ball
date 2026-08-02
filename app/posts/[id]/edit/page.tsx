import type { Metadata } from "next";
import { notFound } from "next/navigation";
// proxy(서버 가드)와 같은 파서를 써야 판정이 어긋나지 않는다 — post-id 주석 참고.
// "use client" 훅을 포함한 @/shared/lib 배럴 대신 직접 경로로 가져온다.
import { parsePostId } from "@/shared/lib/post-id";
import { AuthRequired } from "@/entities/session";
import { PostEditView } from "@/views/post-edit";

export const metadata: Metadata = { title: "글 수정 · 온더볼" };

export default async function Page(props: PageProps<"/posts/[id]/edit">) {
  const { id } = await props.params;
  const postId = parsePostId(id);
  if (postId === null) notFound();

  return (
    <AuthRequired>
      <PostEditView postId={postId} />
    </AuthRequired>
  );
}
