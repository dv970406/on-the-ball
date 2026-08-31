export { cn } from "./cn";
export { useScrollRestore, clearScrollRestore } from "./use-scroll-restore";
// ⚠ `formatMatchDay`·`seoulDayKey`는 **여기 올리지 않는다** — 유일한 소비자가 서버 안전
//    모듈(`entities/match/lib/day-group.ts`)이라 `@/shared/lib/format` 직접 경로로 가져간다.
//    배럴에 두면 호출부 0인 export가 되어 재사용 목록을 오염시킨다(`reuse.md`).
//    ⚠ `check:conventions`는 이 유형을 잡지 못한다(상대·직접 경로 소비도 "현역"으로 센다).
export {
  formatCount,
  formatKickoff,
  formatKickoffTime,
  formatRelativeTime,
} from "./format";
export { useNowMs } from "./use-now";
export { useFocusTrap } from "./use-focus-trap";
export { useToast, useToastStore } from "./toast-store";
export { parsePostId } from "./post-id";
export {
  hasVisibleChar,
  codePointLength,
  graphemeLength,
  lengthOverflow,
  normalizeNickname,
  clamp,
  type TextLimit,
} from "./text";
export { useNextParam } from "./use-next-param";
export { useDuplicateGuard } from "./use-duplicate-guard";
// ⚠ 쿼리 키 조각이라 **서버 안전**하다 — 서버 프리페치가 키를 만들 일이 생기면
//   배럴이 아니라 "@/shared/lib/query-scope" 직접 경로로.
export { userScope } from "./query-scope";
// ⚠ 이 배럴은 "use client" 훅을 포함하므로 서버(proxy·서버 컴포넌트)는 여기서 import 금지.
//   순수 함수가 필요하면 "@/shared/lib/cn"·"@/shared/lib/format"·"@/shared/lib/post-id"·
//   "@/shared/lib/text"·"@/shared/lib/query-scope"를 직접 import.
//   ⚠ "use client"를 붙이지 않은 shared/ui 컴포넌트도 여기 해당한다 — 배럴을 거치면
//     서버 렌더 여지를 잃는다(선례: shared/ui/empty-state.tsx).
//   이 목록이 곧 deep import 화이트리스트다 — 검증은 `pnpm check:conventions`가 한다.
