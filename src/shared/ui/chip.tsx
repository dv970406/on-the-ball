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
        // ⚠ **글자색은 전환하지 않는다.** 배경(잉크↔흰색)과 글자색(흰색↔잉크)을 같은
        //   150ms로 함께 보간하면 중간 지점에서 회색 위 회색이 되어 **라벨이 사라진 것처럼
        //   보인다**(실측 ~75ms). 배경·테두리만 전환하고 글자는 즉시 바꾼다.
        "transition-[background-color,border-color] duration-150 ease-otb",
        selected
          ? "border-ink bg-ink text-white"
          : "border-hairline bg-canvas text-ink-mute active:bg-canvas-soft",
        className,
      )}
      {...props}
    />
  );
}
