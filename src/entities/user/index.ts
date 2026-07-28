// user 엔티티 public API
// ⚠ Route Handler에서는 이 배럴 대신 서버 안전 경로를 직접 import:
//   - "@/entities/user/model/types" (타입)
//   - "@/entities/user/api/mappers" (my_profile 뷰 select·매퍼)
export type { Profile } from "./model/types";
export { useMyProfileQuery, userQueryKeys } from "./api/queries";
