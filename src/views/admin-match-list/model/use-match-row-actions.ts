"use client";

import { useRef, useState } from "react";
import { useToast } from "@/shared/lib";
import { useDeleteMatch, useRestoreMatch } from "@/features/admin-match";

/**
 * 목록의 **항목별** 삭제·복구 가드.
 *
 * ⚠ `useDuplicateGuard`(boolean)를 쓰지 않는다 — 뮤테이션 훅이 하나뿐이라 다른 항목을 누르는
 *   순간 `variables`가 갈아타 처리 중이던 행의 버튼이 되살아난다. 보낸 id의 **집합**을
 *   기억하고, 동기 판정용 `ref`와 렌더 표시용 `state`를 따로 둔다(`useBlockRemoval` 선례).
 * ⚠ 해제를 `mutate`의 per-call 콜백에 걸면 다음 항목을 누를 때 **앞 항목의 콜백이
 *   유실되어** 무증상 잠금이 된다(query-core가 옵저버를 떼어낸다) → `mutateAsync().finally()`.
 * ⚠ 렌더 표시도 `isPending`이 아니라 **집합만으로** 판정한다 — `isPending`은 마지막 호출
 *   하나만 반영해서, A가 날아가는 중에 B가 끝나면 A의 "…중" 표시가 먼저 꺼진다.
 */
export function useMatchRowActions() {
  const remove = useDeleteMatch();
  const restore = useRestoreMatch();
  const toast = useToast();

  const sentRef = useRef<Set<number>>(new Set());
  const [sentIds, setSentIds] = useState<ReadonlySet<number>>(new Set());

  const release = (id: number) => {
    sentRef.current.delete(id);
    setSentIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const run = (id: number, kind: "delete" | "restore") => {
    if (sentRef.current.has(id)) return;
    sentRef.current.add(id);
    setSentIds((prev) => new Set(prev).add(id));

    const mutation = kind === "delete" ? remove : restore;
    mutation
      .mutateAsync(id)
      .then(() => toast(kind === "delete" ? "경기를 숨겼어요" : "경기를 되돌렸어요"))
      // 문구는 훅의 onError가 이미 보냈다
      .catch(() => {})
      .finally(() => release(id));
  };

  return {
    remove: (id: number) => run(id, "delete"),
    restore: (id: number) => run(id, "restore"),
    isBusy: (id: number) => sentIds.has(id),
  };
}
