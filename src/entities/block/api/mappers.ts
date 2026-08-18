import type { Database } from "@/types/database.types";
import type { BlockedUser, UserBlockRow } from "../model/types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * PostgREST select 문자열의 단일 소스 — 스키마가 바뀌면 여기 한 곳만 고친다.
 *
 * ⚠ 그냥 `profiles(nickname)`이라고 쓰면 **PGRST201로 실패한다.** `user_block → profiles`
 *   경로가 둘(`blocker_id`·`blocked_id`)이라 모호하기 때문이다 — `post`의
 *   `author:author_id(...)`와 같은 함정이다.
 *
 * ⚠ 다만 여기서는 `blocked:blocked_id(...)`가 아니라 **`대상테이블!FK컬럼` 힌트 형태**를 쓴다.
 *   런타임은 둘 다 통하지만(실측), 컬럼명만 적은 형태는 **생성 타입의 추론이 모호성을 풀지
 *   못해** `SelectQueryError<"...more than one relationship...">`가 나온다. 그걸 캐스트로
 *   덮으면 스키마가 어긋나도 컴파일러가 말해주지 않으므로, 추론이 통하는 문법을 쓴다.
 *   `post`가 컬럼명 형태로 되는 것은 그쪽 경로가 하나뿐이라 모호하지 않아서다.
 *
 * ⚠ `"use client"`가 없다(순수·서버 안전). `post`·`comment`의 `api/mappers.ts`와 같은 자리다.
 */
export const BLOCKED_SELECT =
  "blocked_id, created_at, blocked:profiles!blocked_id(nickname, avatar_path)";

/** BLOCKED_SELECT가 돌려주는 행 — 컬럼 타입은 생성 타입에서 뽑는다 */
export interface BlockedSelectRow {
  blocked_id: UserBlockRow["blocked_id"];
  created_at: UserBlockRow["created_at"];
  blocked: Pick<ProfileRow, "nickname" | "avatar_path"> | null;
}

/** row(snake) → 도메인(camel) */
export function buildBlockedUser(row: BlockedSelectRow): BlockedUser {
  return {
    userId: row.blocked_id,
    // 프로필이 사라진 계정(탈퇴)은 cascade로 차단 행도 함께 지워지므로 여기 null이 오는 것은
    // 일시적 조회 실패뿐이다. 라벨 없는 행을 그리지 않도록 폴백을 둔다.
    nickname: row.blocked?.nickname ?? "알 수 없는 사용자",
    avatarPath: row.blocked?.avatar_path ?? null,
    blockedAt: row.created_at,
  };
}
