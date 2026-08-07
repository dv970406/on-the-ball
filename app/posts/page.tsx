import type { Metadata } from "next";
import { PostListView } from "@/views/post-list";

export const metadata: Metadata = {
  title: "커뮤니티",
  // description을 적지 않는다 — 루트 layout의 값을 상속한다.
  // 여기에 같은 문구를 다시 적으면 소개 문구의 단일 소스가 둘로 갈린다(title.template과 같은 이유).
};

export default function Page() {
  return <PostListView />;
}
