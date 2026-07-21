"use client";

import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import { Icon } from "./icon";

const BUTTON_VARIANT = {
  primary: "bg-primary text-on-primary active:bg-primary-deep",
  dark: "bg-ink text-white active:bg-[#2a2a2a]",
  secondary: "border-hairline-strong bg-canvas text-ink",
} as const;

interface ButtonStyle {
  variant?: keyof typeof BUTTON_VARIANT;
  size?: "md" | "sm";
  /** 가로 꽉 채움 */
  block?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * 버튼 시각 스타일 — 색·형태의 단일 소스.
 * 버튼형 Link(경로 이동)에서도 동일 외형을 재사용하기 위해 노출한다.
 */
export function buttonClassName({
  variant = "primary",
  size = "md",
  block,
  disabled,
  className,
}: ButtonStyle = {}) {
  return cn(
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border border-transparent font-medium leading-none transition-colors duration-150 ease-otb",
    size === "sm" ? "px-3 py-2 text-[13px]" : "px-[18px] py-3.5 text-[15px]",
    BUTTON_VARIANT[variant],
    block && "w-full",
    disabled && "pointer-events-none opacity-40",
    className,
  );
}

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
