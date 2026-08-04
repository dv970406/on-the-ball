"use client";

import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import { Icon } from "./icon";

interface ActionChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  icon: LucideIcon;
  iconSize?: number;
  /** 눌린 상태 — 에메랄드로 채워진다. 상세 화면에서는 좋아요 하나만 이 상태를 가질 수 있다 */
  active?: boolean;
}

/**
 * 카운터형 액션 칩 (프로토타입 `.cm-act`).
 *
 * "알약 버튼 금지" 규칙의 **명시적 예외 4곳** 중 하나다
 * (나머지: 아바타 · 댓글 입력창 · 플로팅 글쓰기 버튼).
 * 숫자를 싣는 칩이라 mono + tabular-nums다.
 */
export function ActionChip({
  icon,
  iconSize = 15,
  active,
  className,
  children,
  ...props
}: ActionChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-[13px]",
        "font-mono text-xs tabular-nums",
        "transition-colors duration-150 ease-otb",
        // ⚠ 시각 크기는 프로토타입의 36px을 지키고, **히트 영역만** 투명 의사요소로 44px까지 넓힌다
        //   (핸드오프: 모든 탭 가능 요소의 실제 히트 영역 최소 44×44).
        //   패딩으로 늘리면 배경이 함께 커져 칩이 뚱뚱해진다.
        "relative after:absolute after:-inset-x-2 after:-inset-y-1 after:content-['']",
        active
          ? "border-primary bg-primary text-on-primary"
          : "border-hairline bg-canvas text-ink-secondary",
        // 비활성 자리표시(저장·신고 등 미구현 액션)는 눌리지 않는다 — 동작을 발명하지 않는다
        "aria-disabled:pointer-events-none aria-disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <Icon as={icon} size={iconSize} />
      {children}
    </button>
  );
}
