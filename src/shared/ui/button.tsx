"use client";

import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { Icon } from "./icon";
// 스타일 계산은 서버 컴포넌트에서도 쓸 수 있도록 "use client" 밖(button-class)에 둔다
import { buttonClassName, type ButtonStyle } from "./button-class";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  Omit<ButtonStyle, "disabled"> & {
    icon?: LucideIcon;
  };

/** 기본 버튼 — 시그니처 6px 라운드, pill 형태 금지 */
export function Button({
  variant = "primary",
  size = "md",
  block,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={buttonClassName({ variant, size, block, disabled, className })}
      {...props}
    >
      {icon && <Icon as={icon} size={size === "sm" ? 14 : 16} />}
      {children}
    </button>
  );
}
