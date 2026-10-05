// 알림(웹 푸시) — 조회는 여기, 쓰기(켜기·끄기)는 `features/push-notification`.
// ⚠ "use client" 쿼리 훅을 포함한다. 이 슬라이스에는 서버가 쓸 것이 없다 — 상태가 브라우저 API에서 나온다.
export type { PushStatus } from "./model/types";
export { usePushStatusQuery } from "./api/queries";
export { pushKeys } from "./api/keys";
// ⚠ "이 구독이 내 것인가"의 조립 — 상태 조회와 알림 켜기(features)가 같은 판정을 쓴다(두 곳이 각자 짜면 조용히 갈린다)
export { buildOwnSubscriptionQuery } from "./api/subscription-query";
