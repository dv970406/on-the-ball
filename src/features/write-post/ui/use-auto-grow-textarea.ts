"use client";

import { useEffect, type RefObject } from "react";

/**
 * textarea 자동 높이 확장 — 내용에 맞춰 `scrollHeight`를 그대로 반영한다.
 *
 * `PostForm` 전용 구현 세부사항이라 **배럴에 노출하지 않는다**(`shared/ui/use-sheet-drag.ts`와
 * 같은 배치 — UI 메커니즘은 `model/`이 아니라 자기 컴포넌트 옆에 둔다).
 *
 * ⚠ ref를 **주입받고 훅이 만들지 않는다.** 컴포넌트가 그 요소에 직접 붙여야 한다.
 * ⚠ CSS로는 대체할 수 없다 — `field-sizing: content`는 아직 타깃 브라우저 범위를 벗어난다.
 */
export function useAutoGrowTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}
