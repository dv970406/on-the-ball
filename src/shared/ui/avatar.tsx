import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/shared/lib";

type AvatarProps = {
  /** 표시할 라벨 — 첫 글자만 사용 */
  label?: string;
  size?: number;
  className?: string;
  /** 그라데이션 등 커스텀 배경용 */
  style?: CSSProperties;
  children?: ReactNode;
};

/** 원형 이니셜 아바타 (댓글·프로필) */
export function Avatar({ label, size = 28, className, style, children }: AvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-hairline-cool bg-canvas-soft text-xs font-medium text-ink",
        className,
      )}
      style={{ width: size, height: size, ...style }}
    >
      {children ?? label?.charAt(0)}
    </span>
  );
}
