import type { Metadata } from "next";
import { AuthRequired } from "@/entities/session";
import { PostWriteView } from "@/views/post-write";

export const metadata: Metadata = {
  title: "새 글 쓰기",
  // 로그인 필수 화면이라 색인 대상이 아니다 — 비로그인에게는 본문이 스켈레톤뿐인 페이지가
  // 정적으로 프리렌더되어 그대로 색인될 수 있다(빌드 로그의 ○ 표기로 확인).
  robots: { index: false, follow: false },
};

export default function Page() {
  // proxy.ts가 하드 내비게이션을 이미 막지만, SPA 전이·세션 만료는 이쪽이 잡는다
  return (
    <AuthRequired>
      <PostWriteView />
    </AuthRequired>
  );
}
