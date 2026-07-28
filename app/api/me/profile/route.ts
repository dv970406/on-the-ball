import { fail, ok, withSupabase } from "@/shared/api/handler";
import {
  MY_PROFILE_SELECT,
  mapProfile,
  type MyProfileRow,
} from "@/entities/user/api/mappers";
import type { Profile } from "@/entities/user/model/types";

/** GET /api/me/profile — 내 프로필 (세션 없으면 null) */
export async function GET() {
  return withSupabase(async ({ supabase, user }) => {
    if (!user) return ok<Profile | null>(null);

    // my_profile 뷰 — auth.uid() 본인 행만 반환 (profiles 직접 조회는 공개 컬럼만 허용)
    const { data, error } = await supabase
      .from("my_profile")
      .select(MY_PROFILE_SELECT)
      .maybeSingle();

    if (error) return fail(500, "프로필을 불러오지 못했어요.");
    if (!data) return ok<Profile | null>(null);

    return ok<Profile>(mapProfile(data as MyProfileRow));
  });
}
