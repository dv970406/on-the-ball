// ⚠ 맨 mutate를 내보내지 않는다 — PKCE verifier 덮어쓰기 가드가 훅 안에 있고,
//    `start`/`remove`만 노출해야 호출자가 가드를 복제할 필요가 없다(useOAuthSignIn과 같은 계약).
//    조회(useLinkedIdentitiesQuery)는 entities/session에 있다.
export { useLinkIdentity, useUnlinkIdentity } from "./model/use-linked-identities";
