"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/shared/lib";

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  selected?: boolean;
}

/**
 * 말머리 칩 (프로토타입 `.cm-chip`) — 목록의 필터 레일과 에디터의 말머리 선택이 공유한다.
 *
 * 선택 시 잉크 블랙이다(에메랄드 아님) — 목록 화면의 컬러 이벤트는 0개여야 한다.
 * 라운드는 6px(`rounded-sm`) — 알약형 금지 규칙의 대상이다.
 */
export function Chip({ selected, className, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "shrink-0 rounded-sm border px-[13px] py-[9px] text-[13px] font-medium leading-none",
        "transition-colors duration-150 ease-otb",
        selected
          ? "border-ink bg-ink text-white"
          : "border-hairline bg-canvas text-ink-mute active:bg-canvas-soft",
        className,
      )}
      {...props}
    />
  );
}
