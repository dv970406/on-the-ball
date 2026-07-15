import { BalanceDetailView } from "@/views/balance-detail";

/** 밸런스 디테일 — params를 풀어 view에 id만 전달 */
export default async function BalanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BalanceDetailView id={id} />;
}
