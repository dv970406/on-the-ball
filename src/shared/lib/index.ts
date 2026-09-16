export { cn } from "./cn";
// ⚠ **승격된 함수다.** `features/write-post`에 있던 것을 세 번째 소비자(어드민 입축구
//   배경)가 생기면서 올렸다 — features끼리는 import할 수 없어 이 자리가 강제된다.
//   `resizeToAvatar`(정사각 crop)는 형태가 달라 함께 올리지 않았다.
export { IMAGE_TARGET_BYTES, resizeToWebp } from "./resize-image";
// ⚠ `datetime-local` ↔ ISO를 **KST로 못박는** 변환기. 승부예측·입축구·공지 셋이 쓴다 —
//   브라우저 로컬 시간대로 파싱하면 해외 접속 시 화면 표기와 몇 시간씩 어긋난다.
export { fromKstInputValue, toKstInputValue } from "./kst-datetime";
export { useScrollRestore, clearScrollRestore } from "./use-scroll-restore";
// ⚠ `formatMatchDay`·`seoulDayKey`는 **여기 올리지 않는다** — 유일한 소비자가 서버 안전
//    모듈(`entities/match/lib/day-group.ts`)이라 `@/shared/lib/format` 직접 경로로 가져간다.
//    배럴에 두면 호출부 0인 export가 되어 재사용 목록을 오염시킨다(`reuse.md`).
//    ⚠ `check:conventions`는 이 유형을 잡지 못한다(상대·직접 경로 소비도 "현역"으로 센다).
export {
  formatCount,
  formatDate,
  formatKickoff,
  formatKickoffTime,
  formatRelativeTime,
} from "./format";
export { useNowMs, useQueryNowMs } from "./use-now";
export { useFocusTrap } from "./use-focus-trap";
export { useToast, useToastStore } from "./toast-store";
export { parsePostId } from "./post-id";
export {
  hasVisibleChar,
  codePointLength,
  graphemeLength,
  lengthOverflow,
  normalizeNickname,
  isPlainNickname,
  clamp,
  type TextLimit,
} from "./text";
export { useNextParam } from "./use-next-param";
export { useDuplicateGuard } from "./use-duplicate-guard";
// 목록의 **항목별** 가드 — boolean 전역 잠금과 형태가 달라(렌더 표시용 상태를 갖는다) 합치지 않는다.
export { useItemGuard } from "./use-item-guard";
// 결과·분포가 **늦게 도착할 때만** 등장 모션을 주는 판정과 카운트업 — 사유는 각 훅 주석에.
//   ⚠ `useMarkHydrated`는 루트(`AppProviders`) 전용이다 — 다른 곳에서 부르지 않는다.
//   ⚠ 렌더에 숫자를 그리는 쪽은 훅이 아니라 `@/shared/ui`의 `CountUp`을 쓴다(훅을 map 안에서
//     부를 수 없어 컴포넌트가 필요하다). `useCountUp`의 소비자는 그 컴포넌트 하나다 — 숫자를
//     그리는 새 자리가 생기면 훅이 아니라 `CountUp`을 쓴다.
export { useEntranceMotion, useMarkHydrated } from "./use-entrance-motion";
export { useCountUp } from "./use-count-up";
// ⚠ 쿼리 키 조각이라 **서버 안전**하다 — 서버 프리페치가 키를 만들 일이 생기면
//   배럴이 아니라 "@/shared/lib/query-scope" 직접 경로로.
export { userScope } from "./query-scope";
// ⚠ 이 배럴은 "use client" 훅을 포함하므로 서버(proxy·서버 컴포넌트)는 여기서 import 금지.
//   순수 함수가 필요하면 "@/shared/lib/cn"·"@/shared/lib/format"·"@/shared/lib/post-id"·
//   "@/shared/lib/text"·"@/shared/lib/query-scope"를 직접 import.
//   ⚠ "use client"를 붙이지 않은 shared/ui 컴포넌트도 여기 해당한다 — 배럴을 거치면
//     서버 렌더 여지를 잃는다(선례: shared/ui/empty-state.tsx).
//   이 목록이 곧 deep import 화이트리스트다 — 검증은 `pnpm check:conventions`가 한다.
