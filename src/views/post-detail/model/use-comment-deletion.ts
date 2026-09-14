"use client";

import { useItemGuard, useToast } from "@/shared/lib";
import { useDeleteComment } from "@/features/delete-comment";

/**
 * 댓글 삭제 — 목록의 **항목별** 삭제라 가드가 키를 받는다(`useItemGuard`).
 *
 * ⚠ `disabled={busy}`만으로는 못 막는다 — isPending은 렌더 이후에야 DOM에 반영되는데
 *   같은 tick의 두 번째 클릭은 아직 enabled인 버튼을 누른다. 두 번째 DELETE는 이미 지워진
 *   행이라 0행이 되고, use-delete-comment가 에러로 승격해 잘못된 배너가 뜬다(실측).
 * ⚠ 세 번 갈아엎은 자리라 형태의 이유를 남긴다 — boolean 하나는 A를 지우는 동안 B가
 *   활성인데 클릭이 무시되는 무증상 잠금이 됐고, id 하나는 B를 누르면 `variables`가 갈아타
 *   A의 버튼이 되살아났다. 그 상태로 A를 또 누르면 0행 → **"삭제 권한이 없어요."** 집합은
 *   보낸 것을 전부 기억하므로 둘이 동시에 닫힌다. 성공해서 목록에서 사라진 댓글도 해제한다 —
 *   "보낸 것만 담는다"는 집합의 뜻을 성공·실패 어느 쪽에서도 흐리지 않는다.
 */
export function useCommentDeletion(postId: number) {
  const toast = useToast();
  const deleteComment = useDeleteComment(postId);
  const guard = useItemGuard<number>();

  const remove = (commentId: number) =>
    guard.run(commentId, () =>
      deleteComment.mutateAsync(commentId).then(() => toast("댓글을 삭제했어요")),
    );

  return { remove, isDeleting: guard.isBusy, error: deleteComment.error };
}
