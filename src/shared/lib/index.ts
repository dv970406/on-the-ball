export { cn } from "./cn";
export { useDelayedReveal } from "./use-delayed-reveal";
export { useScrollRestore } from "./use-scroll-restore";
export {
  formatCount,
  formatPct,
  formatDday,
  isClosed,
  todayUtc,
  formatYearMonth,
  formatRelativeTime,
} from "./format";
export { parsePostId } from "./post-id";
export { useNextParam } from "./use-next-param";
// ⚠ 이 배럴은 "use client" 훅을 포함하므로 서버(proxy·서버 컴포넌트)는 여기서 import 금지.
//   순수 함수가 필요하면 "@/shared/lib/format"·"@/shared/lib/post-id"를 직접 import.
