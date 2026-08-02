import type { Metadata } from "next";
import { AuthRequired } from "@/entities/session";
import { PostWriteView } from "@/views/post-write";

export const metadata: Metadata = { title: "새 글 쓰기 · 온더볼" };

export default function Page() {
  // proxy.ts가 하드 내비게이션을 이미 막지만, SPA 전이·세션 만료는 이쪽이 잡는다
  return (
    <AuthRequired>
      <PostWriteView />
    </AuthRequired>
  );
}
