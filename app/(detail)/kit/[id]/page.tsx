import { KitVoteView } from "@/views/kit-vote";

/** 유니폼 투표 디테일 — params 언랩 후 클라이언트 뷰 마운트 */
export default async function KitVotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <KitVoteView pollId={id} />;
}
