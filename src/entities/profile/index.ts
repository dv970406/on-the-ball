// ⚠ "use client" 쿼리 훅을 포함한다 — 서버에서는 아래를 **직접 경로로** 가져간다.
//    model/types · api/keys · api/mappers (전부 순수·서버 안전)
//    post·comment 슬라이스와 같은 형태다(architecture.md의 서버/클라이언트 경계).
export type { MyProfile, ProfileRow } from "./model/types";
export { useProfileQuery } from "./api/queries";
export { profileKeys } from "./api/keys";
export { PROFILE_SELECT, buildProfile } from "./api/mappers";
// ⚠ avatarUrl·AVATAR_BUCKET은 여기 없다 — entities 셋(comment·post·profile)이 함께 써야 하는데
//    entities끼리는 import할 수 없어 `@/shared/config`로 옮겼다(OAUTH_PROVIDERS와 같은 사정).
