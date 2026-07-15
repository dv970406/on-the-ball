import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/shared/lib";

const PILL_VARIANT = {
  green: "bg-primary font-medium text-on-primary",
  soft: "border border-hairline-cool bg-canvas-soft text-ink",
  outline: "border border-hairline bg-transparent text-ink-mute",
  dark: "bg-ink text-white",
  yellow: "border border-[#fff0a0] bg-[#fff8c5] text-[#5a4a00]",
  crimson: "border border-crimson/25 bg-crimson/[0.08] text-crimson",
} as const;

type PillProps = {
  variant?: keyof typeof PILL_VARIANT;
  /** 앞에 붙는 5px 상태 닷 색상 */
  dot?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

/** 소형 태그/상태 pill (radius full — 버튼에는 사용 금지) */
export function Pill({ variant = "soft", dot, className, style, children }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-[9px] py-[5px] text-[11px] leading-none",
        PILL_VARIANT[variant],
        className,
      )}
      style={style}
    >
      {dot ? (
        <span
          className="mr-0.5 inline-block size-[5px] rounded-full"
          style={{ background: dot }}
        />
      ) : null}
      {children}
    </span>
  );
}
