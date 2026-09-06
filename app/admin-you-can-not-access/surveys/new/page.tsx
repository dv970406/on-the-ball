import type { Metadata } from "next";
import { AdminSurveyFormView } from "@/views/admin-survey-form";

// 제목은 layout이 아니라 page가 갖는다 — 사유는 layout의 주석에.
export const metadata: Metadata = { title: "입축구 등록" };

export default function Page() {
  return <AdminSurveyFormView />;
}
