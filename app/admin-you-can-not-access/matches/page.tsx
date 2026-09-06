import type { Metadata } from "next";
import { AdminMatchListView } from "@/views/admin-match-list";

// 제목은 layout이 아니라 page가 갖는다 — 사유는 layout의 주석에.
export const metadata: Metadata = { title: "경기 관리" };

/**
 * ⚠ 필터는 **URL이 소유한다**(`?deleted=1`). `useSearchParams`는 프리렌더를 CSR로
 *   떨어뜨리므로 서버가 읽어 prop으로 내린다(`/posts`의 `?sort=`와 같은 방식).
 */
export default async function Page(props: PageProps<"/admin-you-can-not-access/matches">) {
  const { deleted } = await props.searchParams;
  return <AdminMatchListView deleted={deleted === "1"} />;
}
