"use client";

import { useRef, useState } from "react";
import { useToast } from "@/shared/lib";
import { useDeleteSurvey, useRestoreSurvey } from "@/features/admin-survey";

/** 항목별 가드 — 사유·형태는 `useMatchRowActions`와 같다(`useBlockRemoval` 선례) */
export function useSurveyRowActions() {
  const remove = useDeleteSurvey();
  const restore = useRestoreSurvey();
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

    (kind === "delete" ? remove : restore)
      .mutateAsync(id)
      .then(() => toast(kind === "delete" ? "입축구를 숨겼어요" : "입축구를 되돌렸어요"))
      .catch(() => {})
      .finally(() => release(id));
  };

  return {
    remove: (id: number) => run(id, "delete"),
    restore: (id: number) => run(id, "restore"),
    isBusy: (id: number) => sentIds.has(id),
  };
}
