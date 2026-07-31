import { fail, ok, withSupabase } from "@/shared/api/handler";
import { buildHomeFeed } from "@/views/home/api/build-home-feed";
import type { HomeFeed } from "@/views/home/model/types";

/**
 * GET /api/home — 홈 피드 조합
 * 조립 로직은 buildHomeFeed가 담당한다(홈 페이지의 서버 프리페치와 공유하는 서버 안전 모듈).
 */
export async function GET() {
  return withSupabase(async ({ supabase, user }) => {
    const feed = await buildHomeFeed(supabase, user?.id ?? null);
    if (!feed) return fail(500, "홈 피드를 불러오지 못했어요.");

    return ok<HomeFeed>(feed);
  });
}
