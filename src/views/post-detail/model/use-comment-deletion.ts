"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/shared/lib";
import { useDeleteComment } from "@/features/delete-comment";

/**
 * 댓글 삭제 — 목록의 **항목별** 삭제라 가드가 키를 받는다.
 *
 * ⚠ `@/shared/lib`의 `useDuplicateGuard`를 쓰지 않는다. 그쪽은 렌더 표시용 상태가 없는
 *   boolean 하나이고, 여기는 아래처럼 **ref(동기 판정) + state(렌더 표시)** 두 개가 본질이다
 *   — 형태가 달라 합치지 않는다.
 *
 * ⚠ `disabled={busy}`만으로는 못 막는다 — isPending은 렌더 이후에야 DOM에 반영되는데
 *   같은 tick의 두 번째 클릭은 아직 enabled인 버튼을 누른다. 두 번째 DELETE는 이미 지워진
 *   행이라 0행이 되고, use-delete-comment가 에러로 승격해 잘못된 배너가 뜬다(실측).
 */
export function useCommentDeletion(postId: number) {
  const toast = useToast();
  const deleteComment = useDeleteComment(postId);

  /**
   * **삭제를 보낸 댓글 id 집합**. boolean 하나도, id 하나도 아니어야 한다.
   *
   * ⚠ 세 번 갈아엎은 자리라 이유를 남긴다.
   *   - boolean 하나: A를 지우는 동안 B가 **활성인데 클릭이 무시되는 무증상 잠금**이 됐다.
   *   - id 하나: `useDeleteComment`는 **훅이 하나뿐**이라 B를 누르면 `variables`가 B로 갈아탄다
   *     → A의 버튼이 다시 활성화되고(`busy=false`) A의 per-call `onSuccess`(토스트)가 버려진다.
   *     그 상태로 A를 또 누르면 이미 지워진 행에 DELETE → 0행 → **"삭제 권한이 없어요."**
   *   - Set: 보낸 것은 전부 기억하므로 위 두 가지가 동시에 닫힌다.
   *
   * ⚠ 성공하면 그 댓글은 목록에서 사라지므로 집합에서 지울 필요가 없다. 실패했을 때만
   *   다시 시도할 수 있게 비운다(그 경우 화면에 에러가 떠 있다).
   */
  const sentRef = useRef<Set<number>>(new Set());
  /**
   * 시각 표시는 **state**로 따로 둔다 — ref는 렌더 중에 읽을 수 없고(리렌더도 유발하지 않는다),
   * 반대로 state는 비동기라 동기 가드로 쓸 수 없다. 두 역할을 한 값에 겹치지 않는다.
   */
  const [sentIds, setSentIds] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    // 뮤테이션이 끝나면(성공·실패 무관) 다시 시도할 수 있게 연다.
    // 성공한 댓글은 목록에서 사라지므로 재클릭 대상이 아니다.
    if (!deleteComment.isPending) sentRef.current.clear();
  }, [deleteComment.isPending]);

  const remove = (commentId: number) => {
    if (sentRef.current.has(commentId)) return;
    sentRef.current.add(commentId);
    setSentIds((prev) => new Set(prev).add(commentId));
    deleteComment.mutate(commentId, {
      onSuccess: () => toast("댓글을 삭제했어요"),
    });
  };

  /**
   * 이 댓글의 삭제가 진행 중인가 — **렌더 중에 부르므로 반드시 state(`sentIds`)를 읽는다.**
   * `sentRef`를 읽으면 변경이 리렌더를 유발하지 않아 "삭제 중…"이 영영 뜨지 않는다.
   *
   * ⚠ `variables === commentId`로 판정하면 안 된다 — 훅이 하나라 다른 댓글을 누르는 순간
   *   갈아타서, 아직 처리 중인 댓글의 버튼이 다시 활성화된다(위 sentRef 주석 참고).
   * ⚠ `isPending`을 함께 보므로 남은 id를 따로 지울 필요가 없다 — 뮤테이션이 끝나는 렌더에서
   *   모든 버튼이 한 번에 풀린다(그때 sentRef도 비워져 재시도가 열린다).
   */
  const isDeleting = (commentId: number) =>
    deleteComment.isPending && sentIds.has(commentId);

  return { remove, isDeleting, error: deleteComment.error };
}
