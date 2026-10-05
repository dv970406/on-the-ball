// 알림 켜기·끄기 — 조회(이 기기의 알림 상태)는 `@/entities/push`.
// ⚠ 맨 `mutate`를 내보내지 않는다 — 가드가 훅 안에 있고 `enable`·`disable`만 노출한다(`useLinkIdentity`와 같은 형태).
export { usePushToggle } from "./model/use-push-toggle";
