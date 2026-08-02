import type { Database } from "@/types/database.types";

/** DB 행 타입은 생성 타입에서 뽑는다(`pnpm db:types`) */
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/** 화면이 쓰는 내 프로필 */
export interface MyProfile {
  id: ProfileRow["id"];
  nickname: ProfileRow["nickname"];
}
