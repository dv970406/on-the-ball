export { cn } from "./cn";
export { useScrollRestore } from "./use-scroll-restore";
// 앱 안의 이동 기록이 있는가 — 화면의 뒤로가기가 사이트를 빠져나가지 않게 하는 판정(사유는 그 파일 주석)
export { hasInAppHistory, useInAppNavigationTracker } from "./in-app-history";
export { formatCount, formatRelativeTime } from "./format";
export { useNowMs, useReferenceNowMs } from "./use-now";
export { isPlainClick } from "./plain-click";
// 서버 시각 → 기기 시계 기준(쿼리의 initialDataUpdatedAt 등 기기 시계와 빼는 자리) — 사유는 그 파일 주석
export { serverToClientTime, serverUpdatedAt } from "./server-clock";
export { useFocusTrap } from "./use-focus-trap";
// 코드로 굴리는 스크롤의 behavior(동작 줄이기면 즉시) — 브라우저에서만 부른다
export { preferredScrollBehavior } from "./scroll-behavior";
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
// 한국 시각 날짜 키(`YYYY-MM-DD`) — 날짜별 소식 화면의 주소와 하루의 경계(사유는 그 파일 주석)
export { kstDateKey, kstDateLabel, parseKstDateKey } from "./date-key";
// 로그인 뒤 돌아올 주소 — 화면이 직접 정한 값(속성)이 있으면 그것, 없으면 지금 주소(사유는 그 파일 주석)
export { RETURN_PATH_ATTR, currentReturnPath } from "./return-path";
export {
  hasVisibleChar,
  lengthOverflow,
  normalizeNickname,
  isPlainNickname,
  type TextLimit,
} from "./text";
// 줄 세운 낙관적 쓰기의 조회 쪽 덮어 넣기(사유는 그 파일 주석)
export { createPendingOverlay } from "./pending-overlay";
export { useNextParam } from "./use-next-param";
export { useDuplicateGuard } from "./use-duplicate-guard";
// 목록의 **항목별** 가드 — 댓글 삭제처럼 뮤테이션 하나를 여러 항목이 나눠 쓸 때(사유는 그 파일 주석)
export { useItemGuard } from "./use-item-guard";
// ⚠ 이 배럴은 "use client" 훅을 포함하므로 서버(proxy·서버 컴포넌트)는 여기서 import 금지.
//   순수 함수가 필요하면 "@/shared/lib/cn"·"@/shared/lib/format"·"@/shared/lib/post-id"·
//   "@/shared/lib/text"·"@/shared/lib/query-scope"·"@/shared/lib/search-params"·"@/shared/lib/date-key"를 직접 import.
//   ⚠ "use client"를 붙이지 않은 shared/ui 컴포넌트도 여기 해당한다 — 배럴을 거치면
//     서버 렌더 여지를 잃는다(선례: shared/ui/empty-state.tsx).
//   허용 목록의 단일 소스는 `scripts/check-conventions.mjs`의 `DEEP_IMPORT_ALLOWED`다.
