import { QuizDetailView } from "@/views/quiz-detail";

/** 퀴즈 디테일 — 뷰 마운트만 담당하는 초경량 서버 컴포넌트 */
export default async function QuizDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <QuizDetailView id={id} />;
}
