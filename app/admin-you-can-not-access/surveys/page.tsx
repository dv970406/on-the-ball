import type { Metadata } from "next";
import { AdminSurveyListView } from "@/views/admin-survey-list";

// 제목은 layout이 아니라 page가 갖는다 — 사유는 layout의 주석에.
export const metadata: Metadata = { title: "입축구 관리" };

export default async function Page(props: PageProps<"/admin-you-can-not-access/surveys">) {
  const { deleted } = await props.searchParams;
  return <AdminSurveyListView deleted={deleted === "1"} />;
}
