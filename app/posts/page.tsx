import type { Metadata } from "next";
import { PostListView } from "@/views/post-list";

export const metadata: Metadata = {
  title: "커뮤니티",
  description: "이적설부터 유니폼 취향까지, 축구 얘기를 끝까지 나누는 곳.",
};

export default function Page() {
  return <PostListView />;
}
