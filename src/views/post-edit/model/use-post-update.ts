"use client";

import { useRouter } from "next/navigation";
import { ROUTES } from "@/shared/config";
import { useDuplicateGuard, useToast } from "@/shared/lib";
import { type PostInput, useUpdatePost } from "@/features/write-post";

/**
 * 글 수정 저장 — `PostForm`의 `onSubmit`이 그대로 부른다.
 *
 * ⚠ **`usePostSubmit`(작성)과 합치지 않는다.** 부수효과가 다르다 — 작성은 목록으로,
 *   수정은 그 글의 상세로 돌아가고 스크롤 저장분도 건드리지 않는다(원본이 목록에서
 *   자리를 옮기지 않으므로). 2회뿐이고 형태가 진짜 같지 않으므로 중복을 둔다
 *   (`code-quality.md`의 "성급한 추상화보다 중복").
 *
 * ⚠ 가드가 features가 아니라 여기 있는 이유·폼에 둘 수 없는 이유는 `usePostSubmit`과 같다.
 */
export function usePostUpdate(postId: number) {
  const router = useRouter();
  const toast = useToast();
  const updatePost = useUpdatePost(postId);
  const guard = useDuplicateGuard(updatePost);

  const submit = (input: PostInput) => {
    if (guard.isLocked()) return;
    guard.lock();
    updatePost.mutate(input, {
      onSuccess: () => {
        router.replace(ROUTES.post(postId));
        toast("수정을 완료했어요");
      },
    });
  };

  /** 수정 모드는 이탈 확인 없이 바로 상세로 복귀한다(원본이 남아 있다) */
  const cancel = () => router.replace(ROUTES.post(postId));

  return { submit, cancel, isPending: updatePost.isPending, error: updatePost.error };
}
