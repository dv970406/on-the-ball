import type { Metadata } from "next";
import { AdminNoticeListView } from "@/views/admin-notice-list";

// 제목은 layout이 아니라 page가 갖는다 — 사유는 layout의 주석에.
export const metadata: Metadata = { title: "공지사항 관리" };

export default async function Page(props: PageProps<"/admin-you-can-not-access/notices">) {
  const { deleted } = await props.searchParams;
  return <AdminNoticeListView deleted={deleted === "1"} />;
}
