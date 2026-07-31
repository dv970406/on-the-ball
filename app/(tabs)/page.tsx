import { unstable_rethrow } from "next/navigation";
import { HomeView } from "@/views/home";
import { buildHomeFeed } from "@/views/home/api/build-home-feed";
import type { HomeFeed } from "@/views/home/model/types";
import { createSupabaseServerClient } from "@/shared/api/supabase-server";

/**
 * 홈 탭 — 도메인 화면들을 잇는 조립 피드.
 * 서버에서 피드를 미리 조립해 첫 화면을 스켈레톤 없이 그린다
 * (요청 쿠키의 익명 세션으로 조회하므로 내 표까지 반영된 상태로 렌더된다).
 */
export default async function HomePage() {
  return <HomeView initialFeed={await prefetchHomeFeed()} />;
}

/**
 * 서버 프리페치 — 어디서 실패하든 undefined를 돌려준다.
 * 프리페치는 첫 페인트 최적화일 뿐이고, 실패해도 클라이언트 쿼리가 그대로 화면을 책임진다.
 */
async function prefetchHomeFeed(): Promise<HomeFeed | undefined> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return undefined; // env 미설정 — 클라이언트가 API 503 안내를 받는다

    const {
      data: { user },
    } = await supabase.auth.getUser();

    return (await buildHomeFeed(supabase, user?.id ?? null)) ?? undefined;
  } catch (e) {
    // 쿠키 조회는 "이 라우트를 동적 렌더로 전환하라"는 Next 내부 에러를 던진다.
    // 이걸 여기서 삼키면 홈이 스켈레톤 상태로 정적 프리렌더돼 버리므로 반드시 되던진다.
    unstable_rethrow(e);
    console.error("[home] 서버 프리페치 실패 — 클라이언트 조회로 폴백:", e);
    return undefined;
  }
}
