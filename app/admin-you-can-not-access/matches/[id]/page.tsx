import type { Metadata } from "next";
import { notFound } from "next/navigation";
// ⚠ 같은 id를 해석하는 곳이 여럿이라 파서는 하나다(`/matches/[id]`가 같은 함수를 쓴다)
import { parsePostId } from "@/shared/lib/post-id";
import { AdminMatchEditView } from "@/views/admin-match-edit";

// 제목은 layout이 아니라 page가 갖는다 — 사유는 layout의 주석에.
export const metadata: Metadata = { title: "경기 수정" };

export default async function Page(props: PageProps<"/admin-you-can-not-access/matches/[id]">) {
  const { id } = await props.params;
  const matchId = parsePostId(id);
  if (matchId === null) notFound();

  // 존재 확인은 하지 않는다 — 어드민 조회 RPC가 0행이면 화면이 "찾을 수 없어요"를 그린다.
  // (일반 라우트와 달리 색인 대상이 아니라 HTTP 상태가 의미를 갖지 않는다.)
  return <AdminMatchEditView matchId={matchId} />;
}
