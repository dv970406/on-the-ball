import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parsePostId } from "@/shared/lib/post-id";
import { AdminPostManageView } from "@/views/admin-post-manage";

// 제목은 layout이 아니라 page가 갖는다 — 사유는 layout의 주석에.
export const metadata: Metadata = { title: "글 관리" };

export default async function Page(props: PageProps<"/admin-you-can-not-access/posts/[id]">) {
  const { id } = await props.params;
  const postId = parsePostId(id);
  if (postId === null) notFound();
  return <AdminPostManageView postId={postId} />;
}
