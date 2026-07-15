import { RankingDetailView } from "@/views/ranking-detail";

/** 랭킹 투표 디테일 — params 언랩 후 클라이언트 뷰 마운트 */
export default async function RankingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RankingDetailView pollId={id} />;
}
