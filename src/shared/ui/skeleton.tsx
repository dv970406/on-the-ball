import { cn } from "@/shared/lib";

/** 로딩 placeholder 블록 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-black/[0.06]", className)} />;
}
