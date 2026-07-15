import { fail, ok, withSupabase } from "@/shared/api/handler";
import type { Profile } from "@/entities/user";

/** GET /api/me/profile — 내 프로필 (세션 없으면 null) */
export async function GET() {
  return withSupabase(async ({ supabase, user }) => {
    if (!user) return ok<Profile | null>(null);

    // my_profile 뷰 — auth.uid() 본인 행만 반환 (profiles 직접 조회는 공개 컬럼만 허용)
    const { data, error } = await supabase
      .from("my_profile")
      .select(
        "id, nickname, fan_team, age_group, region, current_streak, best_streak, created_at",
      )
      .maybeSingle();

    if (error) return fail(500, "프로필을 불러오지 못했어요.");
    if (!data) return ok<Profile | null>(null);

    return ok<Profile>({
      id: data.id,
      nickname: data.nickname,
      fanTeam: data.fan_team,
      ageGroup: data.age_group,
      region: data.region,
      currentStreak: data.current_streak,
      bestStreak: data.best_streak,
      joinedAt: data.created_at,
    });
  });
}
