import { cache } from "react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { OG_IMAGE, OG_SITE, ROUTES, absoluteUrl } from "@/shared/config";
import { createSupabaseServerClient, hasSessionCookie } from "@/shared/api/supabase-server";
import { createSupabaseAnonClient } from "@/shared/api/supabase-anon";
// ⚠ 배럴이 아니라 직접 경로 — 조립 함수는 "use client"가 없어 서버에서 쓸 수 있다.
//   범위·상한·RPC 인자를 클라이언트 훅과 **공유해야** 하이드레이션 직후 순위가 안 흔들린다.
import { fetchMatchRanking } from "@/entities/match/api/ranking-query";
import type { MatchRanking } from "@/entities/match/model/types";
import { MatchRankingView } from "@/views/match-ranking";

const TITLE = "승부예측 랭킹";
const DESCRIPTION = "EPL 승부예측 적중 순위 — 이번 시즌 전체와 최근 라운드에서 누가 가장 많이 맞혔는지 확인해 보세요.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // 필터·정렬이 URL에 없어도 자기 참조 canonical을 둔다 — `?utm_…`이 붙은 URL이 별개 페이지로
  // 색인되는 것을 막는다(목록 화면들과 같은 처리).
  alternates: { canonical: ROUTES.matchRanking },
  openGraph: {
    ...OG_SITE,
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl(ROUTES.matchRanking),
    // ⚠ 세그먼트가 openGraph를 채우면 루트 이미지 상속이 통째로 사라진다 → 명시한다
    images: OG_IMAGE,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: OG_IMAGE },
};

interface RankingPrefetch {
  /**
   * 프리페치 결과.
   * ⚠ `undefined`(실패 — 클라이언트가 조회한다)와 `null`(채점된 경기가 없다)은 **다른 뜻**이다.
   *   하나로 접으면 비시즌에 이 화면을 열 때마다 클라이언트가 한 번 더 조회한다.
   */
  ranking?: MatchRanking | null;
  userId?: string;
}

/**
 * ⚠ **세션이 없으면 익명 클라이언트로 갈아탄다**(`app/surveys/page.tsx`와 같은 갈림).
 *   비로그인에게 랭킹은 모든 요청에 동일하다 — `is_me`가 전부 false라 사용자별 값이 한 조각도
 *   없다 → Data Cache를 태워 크롤러의 조회가 DB에서 전 참여자를 다시 세지 않게 한다
 *   (RPC를 GET으로 부르는 이유가 이것이다 — `fetchMatchRanking` 주석).
 * ⚠ 판정은 쿠키만 본다 — 헛짚어도 평소 경로로 갈 뿐이다(사유는 `hasSessionCookie` 주석).
 * ⚠ 로그인 사용자는 쿠키 클라이언트라 `auth.uid()`가 잡혀 **본인 행(`is_me`)이 서버에서부터**
 *   칠해진다 — 서버·클라 판정이 갈리지 않는다.
 * ⚠ `cache()`로 감싼다 — 지금은 소비자가 `Page` 하나지만 `generateMetadata`를 동적으로
 *   바꾸는 순간(예: 1등 닉네임을 설명에 싣기) 요청당 2회가 된다.
 */
const fetchRanking = cache(async (): Promise<RankingPrefetch> => {
  try {
    if (!(await hasSessionCookie())) {
      const anon = createSupabaseAnonClient();
      if (!anon) return {};
      const { data, error } = await fetchMatchRanking(anon);
      if (error) return {};
      return { ranking: data };
    }

    const supabase = await createSupabaseServerClient();
    if (!supabase) return {};

    // ⚠ 두 요청은 서로의 결과를 쓰지 않는다 → 병렬로 보낸다
    const [{ data: auth }, { data, error }] = await Promise.all([
      supabase.auth.getUser(),
      fetchMatchRanking(supabase),
    ]);
    if (error) return { userId: auth.user?.id };
    return { ranking: data, userId: auth.user?.id };
  } catch (e) {
    // cookies()가 던지는 프레임워크 내부 에러를 삼키면 페이지가 스켈레톤 상태로 정적
    // 프리렌더되어 조용히 망가진다.
    unstable_rethrow(e);
    console.error("[matches/ranking] 랭킹 조회 실패:", e);
    return {};
  }
});

export default async function Page() {
  const { ranking, userId } = await fetchRanking();
  return <MatchRankingView initialRanking={ranking} initialUserId={userId} />;
}
