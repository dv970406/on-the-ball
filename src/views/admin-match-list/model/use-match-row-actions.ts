"use client";

import { useItemGuard, useToast } from "@/shared/lib";
import { useDeleteMatch, useRestoreMatch } from "@/features/admin-match";

/**
 * 목록의 **항목별** 삭제·복구.
 *
 * ⚠ `useDuplicateGuard`(boolean)가 아니라 `useItemGuard`다 — 뮤테이션 훅이 하나뿐이라 다른
 *   항목을 누르는 순간 처리 중이던 행의 버튼이 되살아난다. 잠금·해제의 순서는 그 훅이 갖는다.
 */
export function useMatchRowActions() {
  const remove = useDeleteMatch();
  const restore = useRestoreMatch();
  const toast = useToast();
  const guard = useItemGuard<number>();

  const run = (id: number, kind: "delete" | "restore") =>
    guard.run(id, () =>
      (kind === "delete" ? remove : restore)
        .mutateAsync(id)
        .then(() => toast(kind === "delete" ? "경기를 숨겼어요" : "경기를 되돌렸어요")),
    );

  return {
    remove: (id: number) => run(id, "delete"),
    restore: (id: number) => run(id, "restore"),
    isBusy: guard.isBusy,
  };
}
