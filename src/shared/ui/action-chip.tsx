"use client";

import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { actionChipClassName } from "./action-chip-class";
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
 * "알약 버튼 금지" 규칙의 **명시적 예외** 중 하나다 —
 * 전량은 `docs/conventions/styling.md`의 알약 예외 표가 갖는다(여기에 목록을 복제하지 않는다.
 * 전에 복제해 두었다가 "대상이 아닌 것"(아바타·아이콘 원형 버튼)까지 예외로 섞여 들어갔다).
 * 숫자를 싣는 칩이라 mono + tabular-nums다.
 *
 * ⚠ 비활성은 `disabled` 속성으로 넘긴다 — `aria-disabled`는 키보드 포커스를 막지 못한다.
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
      className={actionChipClassName({
        active,
        className: [
          // ⚠ 시각 크기는 프로토타입의 36px을 지키고, **히트 영역만** 투명 의사요소로 44px까지
          //   넓힌다(핸드오프: 탭 가능 요소의 실제 히트 영역 최소 44×44).
          //   패딩으로 늘리면 배경이 함께 커져 칩이 뚱뚱해진다.
          "relative after:absolute after:-inset-x-2 after:-inset-y-1 after:content-['']",
          "disabled:opacity-40",
          className,
        ]
          .filter(Boolean)
          .join(" "),
      })}
      {...props}
    >
      <Icon as={icon} size={iconSize} />
      {children}
    </button>
  );
}
