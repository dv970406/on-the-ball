"use client";

import { useRouter } from "next/navigation";
import { ROUTES } from "@/shared/config";
import { clearScrollRestore } from "@/shared/lib";
import { useToast } from "@/shared/ui";
import { PostForm, useCreatePost } from "@/features/write-post";

/**
 * 글쓰기 화면. 헤더·툴바·이탈 방어까지 PostForm이 한 덩어리로 갖는다
 * (헤더의 `등록` 버튼이 곧 폼의 submit이라 분리하면 form 밖의 버튼이 된다).
 */
export function PostWriteView() {
  const router = useRouter();
  const createPost = useCreatePost();
  const toast = useToast();

  return (
    <PostForm
      mode="create"
      isPending={createPost.isPending}
      error={createPost.error}
      onCancel={() => router.replace(ROUTES.postList)}
      onSubmit={(input) =>
        createPost.mutate(input, {
          onSuccess: () => {
            // 새 글은 목록 맨 위에 붙는다 — 저장된 스크롤을 복원하면 화면 밖이라 안 보인다
            clearScrollRestore(ROUTES.postList);
            // 프로토타입은 등록 후 **목록**으로 돌아간다(상세가 아니다).
            // 작성 화면으로 뒤로가기 하지 않도록 replace.
            router.replace(ROUTES.postList);
            toast("글을 올렸어요");
          },
        })
      }
    />
  );
}
