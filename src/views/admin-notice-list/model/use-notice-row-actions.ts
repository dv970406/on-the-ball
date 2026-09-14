"use client";

import { useItemGuard, useToast } from "@/shared/lib";
import { useDeleteNotice, useRestoreNotice } from "@/features/admin-notice";

/** 항목별 삭제·복구 — 사유·형태는 `useMatchRowActions`와 같다 */
export function useNoticeRowActions() {
  const remove = useDeleteNotice();
  const restore = useRestoreNotice();
  const toast = useToast();
  const guard = useItemGuard<number>();

  const run = (id: number, kind: "delete" | "restore") =>
    guard.run(id, () =>
      (kind === "delete" ? remove : restore)
        .mutateAsync(id)
        .then(() => toast(kind === "delete" ? "공지를 삭제했어요" : "공지를 되돌렸어요")),
    );

  return {
    remove: (id: number) => run(id, "delete"),
    restore: (id: number) => run(id, "restore"),
    isBusy: guard.isBusy,
  };
}
