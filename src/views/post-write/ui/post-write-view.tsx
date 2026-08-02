"use client";

import { useRouter } from "next/navigation";
import { ROUTES } from "@/shared/config";
import { SubHeader } from "@/widgets/sub-header";
import { PostForm, useCreatePost } from "@/features/write-post";

export function PostWriteView() {
  const router = useRouter();
  const createPost = useCreatePost();

  return (
    <>
      <SubHeader title="새 글 쓰기" fallbackHref={ROUTES.postList} />
      {/* SubHeader의 타이틀은 heading이 아니라 크롬이다 — 페이지 heading을 따로 둔다 */}
      <main>
        <h1 className="sr-only">새 글 쓰기</h1>
        <PostForm
          submitLabel="등록하기"
          pendingLabel="등록 중…"
          isPending={createPost.isPending}
          error={createPost.error}
          onSubmit={(input) =>
            createPost.mutate(input, {
              // 작성 화면으로 뒤로가기 하지 않도록 replace
              onSuccess: (postId) => router.replace(ROUTES.post(postId)),
            })
          }
        />
      </main>
    </>
  );
}
