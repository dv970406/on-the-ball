import type { Metadata } from "next";
import { listMetadata, renderPostList } from "./list-page";

/** 전체 목록. 말머리 페이지와 메타데이터 규칙을 공유한다(list-page.tsx) */
export const metadata: Metadata = listMetadata(null);

export default async function Page(props: PageProps<"/posts">) {
  const { sort } = await props.searchParams;
  // ⚠ `useSearchParams`(클라이언트 훅)가 아니라 **서버 컴포넌트의 prop**이다 —
  //   훅을 쓰면 프리렌더가 CSR로 떨어진다(nextjs.md에서 금지).
  return renderPostList(null, typeof sort === "string" ? sort : undefined);
}
