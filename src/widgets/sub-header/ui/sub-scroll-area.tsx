import type { ReactNode, Ref } from "react";
import { cn } from "@/shared/lib/cn";

/**
 * 서브헤더 화면의 스크롤 영역(`<main>`) — 넓은 화면의 가운데 열은 호출부가 안쪽에 둔다(열 밖에서도 휠이 먹게 — `styling.md`).
 *
 * - `relative` — 안의 `sr-only`(position:absolute)가 프레임까지 새지 않게 한다(사유는 `TabScrollArea` 주석).
 * - `md:[scrollbar-gutter:stable]` — 스켈레톤 ↔ 내용으로 넘침이 바뀌어도 가운데 열이 스크롤바 폭만큼 흔들리지 않게 한다.
 * ⚠ 상호작용이 없어 `"use client"`를 달지 않는다. 항목을 눌렀다 돌아오는 목록은 `RestoringSubScrollArea`를 쓴다.
 */
export function SubScrollArea({ children, className, ref }: { children: ReactNode; className?: string; ref?: Ref<HTMLElement> }) {
  return (
    <main
      ref={ref}
      className={cn(
        "no-scrollbar relative min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(32px+env(safe-area-inset-bottom))] md:[scrollbar-gutter:stable]",
        className,
      )}
    >
      {children}
    </main>
  );
}
