"use client";

import { useRouter } from "next/navigation";
import { ROUTES } from "@/shared/config";
import { clearScrollRestore, useDuplicateGuard, useToast } from "@/shared/lib";
import { useDeletePost } from "@/features/delete-post";

/**
 * 글 삭제 — 확인 다이얼로그의 `onConfirm`이 그대로 부른다.
 *
 * ⚠ **가드가 `useDeletePost`가 아니라 여기 있는 이유**: 삭제 성공의 부수효과(스크롤 저장분
 *   폐기 → 목록으로 이동 → 토스트)가 **이 화면의 결정**이라 features로 내릴 수 없다.
 *   그러면 하위 레이어가 "삭제 후 어디로 가는가"를 알게 된다. 뮤테이션을 **조립하는 쪽**이
 *   방어도 갖는다는 규약을 그대로 지키되, 그 자리가 뷰의 model일 뿐이다.
 *
 * ⚠ 다이얼로그가 확인 즉시 닫히지만 `disabled`는 렌더 이후에야 반영되므로, 같은 tick의
 *   두 번째 클릭이 RPC를 한 번 더 쏜다. 두 번째는 이미 삭제된 글이라
 *   "존재하지 않는 게시글입니다"로 실패해 **이동 직전에 엉뚱한 에러가 깜빡인다.**
 *
 * ⚠ `clearScrollRestore` → `router.replace` → `toast` **순서를 지킨다.** 첫 줄을 빠뜨리면
 *   방금 지운 글이 있던 자리로 목록 스크롤이 복원된다.
 *
 * ⚠ `isPending`을 반환하지 않는다 — 소비자가 없다(다이얼로그가 즉시 닫힌다).
 *   `use-delete-post`가 무효화 Promise를 일부러 반환하지 않는 것도 같은 이유이므로
 *   여기서 `await`로 그 규약을 깨지 않는다(기다리면 "글을 찾을 수 없어요"가 깜빡인다).
 */
export function usePostDeletion(postId: number) {
  const router = useRouter();
  const toast = useToast();
  const deletePost = useDeletePost(postId);
  const guard = useDuplicateGuard(deletePost);

  const remove = () => {
    if (guard.isLocked()) return;
    guard.lock();
    deletePost.mutate(undefined, {
      onSuccess: () => {
        // 방금 본 글이 목록에서 빠져 위치가 밀린다 → 복원하지 않고 맨 위에서 시작
        clearScrollRestore(ROUTES.postList);
        router.replace(ROUTES.postList);
        toast("글을 삭제했어요");
      },
    });
  };

  return { remove, error: deletePost.error };
}
