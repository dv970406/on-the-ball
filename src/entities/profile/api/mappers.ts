import type { MyProfile, ProfileRow } from "../model/types";

/**
 * select 컬럼의 단일 소스 — 스키마가 바뀌면 여기 한 곳만 고친다.
 *
 * ⚠ `"use client"`가 없다(순수·서버 안전). `post`·`comment`의 `api/mappers.ts`와 같은 자리다.
 */
export const PROFILE_SELECT = "id, nickname, avatar_path";

/** PROFILE_SELECT가 돌려주는 행 — 컬럼 타입은 생성 타입에서 뽑는다 */
export type ProfileSelectRow = Pick<ProfileRow, "id" | "nickname" | "avatar_path">;

/** row(snake) → 도메인(camel) */
export function buildProfile(row: ProfileSelectRow): MyProfile {
  return { id: row.id, nickname: row.nickname, avatarPath: row.avatar_path };
}
