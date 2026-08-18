"use client";

import { useRouter } from "next/navigation";
import { ROUTES } from "@/shared/config";
import { clearScrollRestore, useDuplicateGuard, useToast } from "@/shared/lib";
import { PostForm, useCreatePost } from "@/features/write-post";

/**
 * 글쓰기 화면. 헤더·툴바·이탈 방어까지 PostForm이 한 덩어리로 갖는다
 * (헤더의 `등록` 버튼이 곧 폼의 submit이라 분리하면 form 밖의 버튼이 된다).
 *
 * ⚠ **중복 제출 가드가 폼이 아니라 여기 있다.** 행이 생기는 뮤테이션이라 방어가 필요한데,
 *   폼은 `isPending`을 prop으로 받아 부모가 리렌더되기 전까지 낡은 값을 읽으므로
 *   거기서 잠그면 해제 신호가 오지 않는다(`use-duplicate-guard.ts`).
 *   뮤테이션을 조립하는 쪽이 방어도 갖는다는 규약을 그대로 지키는 배치다.
 */
export function PostWriteView() {
  const router = useRouter();
  const createPost = useCreatePost();
  const guard = useDuplicateGuard(createPost);
  const toast = useToast();

  return (
    <PostForm
      mode="create"
      isPending={createPost.isPending}
      error={createPost.error}
      onCancel={() => router.replace(ROUTES.postList)}
      onSubmit={(input, poll) => {
        if (guard.isLocked()) return;
        guard.lock();
        createPost.mutate({ input, poll }, {
          onSuccess: () => {
            // 새 글은 목록 맨 위에 붙는다 — 저장된 스크롤을 복원하면 화면 밖이라 안 보인다
            clearScrollRestore(ROUTES.postList);
            // 프로토타입은 등록 후 **목록**으로 돌아간다(상세가 아니다).
            // 작성 화면으로 뒤로가기 하지 않도록 replace.
            router.replace(ROUTES.postList);
            toast("글을 올렸어요");
          },
        });
      }}
    />
  );
}
