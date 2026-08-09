import type { Database } from "@/types/database.types";

/** DB 행 타입은 생성 타입에서 뽑는다(`pnpm db:types`) */
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/** 화면이 쓰는 프로필 */
export interface MyProfile {
  id: ProfileRow["id"];
  nickname: ProfileRow["nickname"];
  /**
   * avatars 버킷 안의 **경로**다(전체 URL이 아니다).
   * 호스트가 환경마다 다르므로(로컬 127.0.0.1:64321 ↔ 원격 supabase.co) URL은 화면이 조립한다.
   * → `avatarUrl(path)` (entities/profile/lib/avatar-url)
   */
  avatarPath: ProfileRow["avatar_path"];
}
