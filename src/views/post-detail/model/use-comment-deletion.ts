"use client";

import { useRef, useState } from "react";
import { useToast } from "@/shared/lib";
import { useDeleteComment } from "@/features/delete-comment";

/**
 * 댓글 삭제 — 목록의 **항목별** 삭제라 가드가 키를 받는다.
 *
 * ⚠ `@/shared/lib`의 `useDuplicateGuard`를 쓰지 않는다. 그쪽은 렌더 표시용 상태가 없는
 *   전역 잠금이고, 여기는 아래처럼 **ref(동기 판정) + state(렌더 표시)** 두 개가 본질이다
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
   */
  const sentRef = useRef<Set<number>>(new Set());
  /**
   * 시각 표시는 **state**로 따로 둔다 — ref는 렌더 중에 읽을 수 없고(리렌더도 유발하지 않는다),
   * 반대로 state는 비동기라 동기 가드로 쓸 수 없다. 두 역할을 한 값에 겹치지 않는다.
   */
  const [sentIds, setSentIds] = useState<ReadonlySet<number>>(new Set());

  /**
   * 두 값에서 그 id를 **함께** 지운다 — 이 쌍이 계약이라 한쪽만 지우지 않는다.
   *
   * ⚠ **해제를 effect가 아니라 per-call 콜백에 건다.** 전에는 `!isPending` effect가
   *   `sentRef`만 비웠는데, 그 탓에 두 가지가 동시에 어긋났다.
   *   ① 실패해서 목록에 **남은** 댓글 A의 id가 `sentIds`에 계속 쌓여, 나중에 B를 지우는 동안
   *      `isDeleting(A)`가 참이 되어 **A 버튼까지 "삭제 중…"으로 잠겼다**(실측 2.5초).
   *   ② effect로 옮겨도 `isPending`(boolean)은 마이크로태스크만으로 끝나는 실패에서
   *      `false → false`라 아예 돌지 않는다(`use-duplicate-guard.ts`와 같은 함정).
   *   콜백은 **보낸 항목별로** 정확히 도착하므로 렌더 타이밍에 기대지 않는다.
   */
  const release = (commentId: number) => {
    sentRef.current.delete(commentId);
    setSentIds((prev) => {
      if (!prev.has(commentId)) return prev;
      const next = new Set(prev);
      next.delete(commentId);
      return next;
    });
  };

  const remove = (commentId: number) => {
    if (sentRef.current.has(commentId)) return;
    sentRef.current.add(commentId);
    setSentIds((prev) => new Set(prev).add(commentId));
    /**
     * ⚠ **해제를 per-call 콜백(`mutate`의 두 번째 인자)에 걸지 않는다.**
     *   `MutationObserver.mutate`는 호출마다 `#mutateOptions`를 덮어쓰고 **이전 mutation에서
     *   옵저버를 떼어낸다**(query-core 5.101). 그래서 A가 처리 중일 때 B를 누르면 **A의
     *   per-call 콜백이 영영 실행되지 않아** `sentRef`에 A가 남고, A가 실패해 목록에 그대로
     *   있으면 **버튼은 활성인데 눌러도 아무 일이 없는 무증상 잠금**이 된다.
     *   `mutateAsync`의 promise는 그 호출의 mutation에 묶여 있어 통지와 무관하게 끝난다.
     *   훅 레벨 콜백(무효화·실패 토스트)은 Mutation이 직접 부르므로 그대로 돈다.
     *
     * 성공하면 그 댓글은 목록에서 사라지지만 그래도 지운다 —
     * "보낸 것만 담는다"는 집합의 뜻을 성공·실패 어느 쪽에서도 흐리지 않는다.
     */
    deleteComment
      .mutateAsync(commentId)
      .then(() => toast("댓글을 삭제했어요"))
      .catch(() => {})
      .finally(() => release(commentId));
  };

  /**
   * 이 댓글의 삭제가 진행 중인가 — **렌더 중에 부르므로 반드시 state(`sentIds`)를 읽는다.**
   * `sentRef`를 읽으면 변경이 리렌더를 유발하지 않아 "삭제 중…"이 영영 뜨지 않는다.
   *
   * ⚠ `variables === commentId`로 판정하면 안 된다 — 훅이 하나라 다른 댓글을 누르는 순간
   *   갈아타서, 아직 처리 중인 댓글의 버튼이 다시 활성화된다(위 sentRef 주석 참고).
   * ⚠ `isPending`을 **함께 보지 않는다.** 그 값은 마지막 호출 하나만 반영하므로, A가 아직
   *   날아가는 중에 B가 끝나면 A의 표시가 먼저 꺼진다. 위 `finally`가 항목별로 확실히
   *   비워 주므로 집합만으로 정확하다.
   */
  const isDeleting = (commentId: number) => sentIds.has(commentId);

  return { remove, isDeleting, error: deleteComment.error };
}
