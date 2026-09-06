import type { Metadata } from "next";
import { AdminPostListView } from "@/views/admin-post-list";

// 제목은 layout이 아니라 page가 갖는다 — 사유는 layout의 주석에.
export const metadata: Metadata = { title: "피드 관리" };

export default async function Page(props: PageProps<"/admin-you-can-not-access/posts">) {
  const { deleted } = await props.searchParams;
  return <AdminPostListView deleted={deleted === "1"} />;
}
