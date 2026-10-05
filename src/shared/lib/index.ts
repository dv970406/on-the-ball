export { cn } from "./cn";
export { useScrollRestore } from "./use-scroll-restore";
export { formatCount, formatRelativeTime } from "./format";
export { useNowMs } from "./use-now";
// 서버 시각 → 기기 시계 기준(쿼리의 initialDataUpdatedAt 등 기기 시계와 빼는 자리) — 사유는 그 파일 주석
export { serverToClientTime } from "./server-clock";
export { useFocusTrap } from "./use-focus-trap";
export { useToast, useToastStore } from "./toast-store";
// 브라우저 푸시 구독의 순수 메커니즘(지원 판정 · 구독 · 해지) — 누구의 구독인지는 모른다(그 파일 주석).
// ⚠ 전부 브라우저에서만 부른다(이벤트 핸들러 · effect · queryFn)
export {
  detectPushSupport,
  getPushSubscription,
  pushSubscriptionUsesKey,
  serializePushSubscription,
  subscribePush,
  unsubscribePush,
  type PushSupport,
} from "./web-push";
// 분석 이벤트 — 이름·파라미터의 단일 소스(`AnalyticsEvents`)와 보내는 함수. 측정 ID가 없으면 아무것도 하지 않는다
export { track } from "./analytics";
export { parsePostId } from "./post-id";
export {
  hasVisibleChar,
  lengthOverflow,
  normalizeNickname,
  isPlainNickname,
  clamp,
  type TextLimit,
} from "./text";
export { useNextParam } from "./use-next-param";
export { useDuplicateGuard } from "./use-duplicate-guard";
// 목록의 **항목별** 가드 — 댓글 삭제처럼 뮤테이션 하나를 여러 항목이 나눠 쓸 때(사유는 그 파일 주석)
export { useItemGuard } from "./use-item-guard";
// ⚠ 쿼리 키 조각이라 **서버 안전**하다 — 서버 프리페치가 키를 만들 일이 생기면
//   배럴이 아니라 "@/shared/lib/query-scope" 직접 경로로.
export { userScope } from "./query-scope";
// ⚠ 이 배럴은 "use client" 훅을 포함하므로 서버(proxy·서버 컴포넌트)는 여기서 import 금지.
//   순수 함수가 필요하면 "@/shared/lib/cn"·"@/shared/lib/format"·"@/shared/lib/post-id"·
//   "@/shared/lib/text"·"@/shared/lib/query-scope"·"@/shared/lib/search-params"를 직접 import.
//   ⚠ "use client"를 붙이지 않은 shared/ui 컴포넌트도 여기 해당한다 — 배럴을 거치면
//     서버 렌더 여지를 잃는다(선례: shared/ui/empty-state.tsx).
//   이 목록이 곧 deep import 화이트리스트다 — 검증은 `pnpm check:conventions`가 한다.
