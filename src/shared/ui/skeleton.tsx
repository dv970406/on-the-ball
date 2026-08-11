// ⚠ 배럴이 아니라 직접 경로다 — 서버 렌더 여지를 남긴다(사유는 empty-state.tsx에).
import { cn } from "@/shared/lib/cn";

/** 로딩 placeholder 블록 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-black/[0.06]", className)} />;
}
