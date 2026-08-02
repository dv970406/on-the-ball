import type { Metadata } from "next";
import { PostListView } from "@/views/post-list";

export const metadata: Metadata = {
  title: "게시판 · 온더볼",
  description: "온더볼 게시판 — 자유롭게 글을 쓰고 이야기를 나눠보세요.",
};

export default function Page() {
  return <PostListView />;
}
