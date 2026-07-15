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

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANT;
  size?: "md" | "sm";
  /** 가로 꽉 채움 */
  block?: boolean;
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
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border border-transparent font-medium leading-none transition-colors duration-150 ease-otb",
        size === "sm" ? "px-3 py-2 text-[13px]" : "px-[18px] py-3.5 text-[15px]",
        BUTTON_VARIANT[variant],
        block && "w-full",
        disabled && "pointer-events-none opacity-40",
        className,
      )}
      {...props}
    >
      {icon ? <Icon as={icon} size={size === "sm" ? 14 : 16} /> : null}
      {children}
    </button>
  );
}
