/**
 * 버튼 시각 스타일 — 색·형태의 단일 소스.
 * ⚠ Button 컴포넌트("use client")와 파일을 나눠 둔 이유: 이 함수는 순수 계산이라
 *   서버 컴포넌트(not-found 등)에서도 호출해야 하는데, "use client" 모듈의 export는
 *   서버에서 값이 아니라 클라이언트 참조가 되어 호출할 수 없다.
 */
import { cn } from "@/shared/lib/cn";

const BUTTON_VARIANT = {
  primary: "bg-primary text-on-primary active:bg-primary-deep",
  dark: "bg-ink text-white active:bg-[#2a2a2a]",
  secondary: "border-hairline-strong bg-canvas text-ink",
} as const;

export interface ButtonStyle {
  variant?: keyof typeof BUTTON_VARIANT;
  size?: "md" | "sm";
  /** 가로 꽉 채움 */
  block?: boolean;
  disabled?: boolean;
  className?: string;
}

/** 버튼형 Link(경로 이동)에서도 동일 외형을 재사용하기 위해 노출한다. */
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
