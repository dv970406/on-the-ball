import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parsePostId } from "@/shared/lib/post-id";
import { AdminSurveyFormView } from "@/views/admin-survey-form";

// 제목은 layout이 아니라 page가 갖는다 — 사유는 layout의 주석에.
export const metadata: Metadata = { title: "입축구 수정" };

export default async function Page(props: PageProps<"/admin-you-can-not-access/surveys/[id]">) {
  const { id } = await props.params;
  const surveyId = parsePostId(id);
  if (surveyId === null) notFound();
  return <AdminSurveyFormView surveyId={surveyId} />;
}
