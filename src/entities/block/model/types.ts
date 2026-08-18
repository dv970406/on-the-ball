import type { Database } from "@/types/database.types";

export type UserBlockRow = Database["public"]["Tables"]["user_block"]["Row"];

/**
 * 프로필 행 타입은 **여기서 직접 뽑는다.**
 * `entities/profile`에서 가져올 수 없기 때문이다 — 동일 레이어 간 import 금지(FSD).
 * `entities/post`·`entities/comment`도 같은 이유로 각자 선언한다.
 */
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * 내가 차단한 사람 — `/profile`의 "차단한 사용자" 목록이 그리는 값.
 *
 * ⚠ 닉네임·사진이 함께 오는 이유는 `profiles_select_all`을 그대로 두었기 때문이다.
 *   차단한 사람의 프로필까지 감췄다면 이 목록이 통째로 "알 수 없음"이 되어
 *   **해제할 대상을 알아볼 수 없게 된다**(마이그레이션 20260818000001 주석).
 */
export interface BlockedUser {
  userId: UserBlockRow["blocked_id"];
  nickname: ProfileRow["nickname"];
  /** 경로다(전체 URL이 아니다) — 조립은 `@/shared/config`의 `avatarUrl()` */
  avatarPath: ProfileRow["avatar_path"];
  blockedAt: UserBlockRow["created_at"];
}
