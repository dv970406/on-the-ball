import type { ReactNode } from "react";
// ⚠ 배럴이 아니라 직접 경로다 — 서버 렌더 여지를 남긴다(사유는 empty-state.tsx에).
import { cn } from "@/shared/lib/cn";

/**
 * 화면이 실제로 쓰는 톤만 둔다 — 쓰는 곳이 없는 변형은 `pnpm check:conventions`가 보지 못하므로
 * (export가 아니라 prop이다) 필요해질 때 그 화면과 함께 더한다.
 * ⚠ `green`은 에메랄드 자리다 — `styling.md`의 표와 `check-conventions.mjs`가 `variant="green"`을 센다.
 */
const PILL_VARIANT = {
  green: "bg-primary font-medium text-on-primary",
  dark: "bg-ink text-white",
} as const;

interface PillProps {
  variant: keyof typeof PILL_VARIANT;
  className?: string;
  children: ReactNode;
}

/** 소형 태그/상태 pill (radius full — 버튼에는 사용 금지) */
export function Pill({ variant, className, children }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-[9px] py-[5px] text-[11px] leading-none",
        PILL_VARIANT[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
