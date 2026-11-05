// 알림 켜기·끄기 — 조회(이 기기의 알림 상태)는 `@/entities/push`.
// ⚠ 맨 `mutate`를 내보내지 않는다 — 가드가 훅 안에 있고 `enable`·`disable`만 노출한다(`useLinkIdentity`와 같은 형태).
export { usePushToggle } from "./model/use-push-toggle";
// 관심 목록에 담은 직후의 알림 안내 — 딜 상세와 보드의 오른쪽 판(`widgets/deal-panel`)이 같은 판정·같은 한 줄을 쓴다
export { PushNudge } from "./ui/push-nudge";
export { usePushNudge } from "./model/use-push-nudge";
