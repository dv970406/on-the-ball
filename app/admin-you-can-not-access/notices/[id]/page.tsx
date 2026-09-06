import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parsePostId } from "@/shared/lib/post-id";
import { AdminNoticeFormView } from "@/views/admin-notice-form";

// 제목은 layout이 아니라 page가 갖는다 — 사유는 layout의 주석에.
export const metadata: Metadata = { title: "공지 수정" };

export default async function Page(props: PageProps<"/admin-you-can-not-access/notices/[id]">) {
  const { id } = await props.params;
  const noticeId = parsePostId(id);
  if (noticeId === null) notFound();
  return <AdminNoticeFormView noticeId={noticeId} />;
}
