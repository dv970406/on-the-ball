/**
 * DB(snake_case) → user 도메인 타입(camelCase) 매퍼.
 * ⚠ Route Handler에서 import하는 파일 — "use client" 금지.
 */
import type { Profile } from "../model/types";

/** my_profile 뷰 select 컬럼 — 본인 전체 행(select * 금지 대상이라 명시) */
export const MY_PROFILE_SELECT =
  "id, nickname, fan_team, age_group, region, current_streak, best_streak, created_at";

/** my_profile 뷰 행 (snake_case) */
export interface MyProfileRow {
  id: string;
  nickname: string;
  fan_team: string | null;
  age_group: string | null;
  region: string | null;
  current_streak: number;
  best_streak: number;
  created_at: string;
}

/** my_profile 행 → Profile — me/activity의 buildActivityProfile와 대칭 */
export function mapProfile(row: MyProfileRow): Profile {
  return {
    id: row.id,
    nickname: row.nickname,
    fanTeam: row.fan_team,
    ageGroup: row.age_group,
    region: row.region,
    currentStreak: row.current_streak,
    bestStreak: row.best_streak,
    joinedAt: row.created_at,
  };
}
