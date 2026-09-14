"use client";

import { useItemGuard, useToast } from "@/shared/lib";
import { useDeleteSurvey, useRestoreSurvey } from "@/features/admin-survey";

/** 항목별 삭제·복구 — 사유·형태는 `useMatchRowActions`와 같다 */
export function useSurveyRowActions() {
  const remove = useDeleteSurvey();
  const restore = useRestoreSurvey();
  const toast = useToast();
  const guard = useItemGuard<number>();

  const run = (id: number, kind: "delete" | "restore") =>
    guard.run(id, () =>
      (kind === "delete" ? remove : restore)
        .mutateAsync(id)
        .then(() => toast(kind === "delete" ? "입축구를 숨겼어요" : "입축구를 되돌렸어요")),
    );

  return {
    remove: (id: number) => run(id, "delete"),
    restore: (id: number) => run(id, "restore"),
    isBusy: guard.isBusy,
  };
}
