import { cache } from "react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { OG_IMAGE, OG_SITE, ROUTES, absoluteUrl } from "@/shared/config";
import { createSupabaseServerClient, hasSessionCookie } from "@/shared/api/supabase-server";
import { createSupabaseAnonClient } from "@/shared/api/supabase-anon";
// ⚠ 배럴이 아니라 직접 경로 — 조립·매퍼는 "use client"가 없어 서버에서 쓸 수 있다(훅과 같은 조립이어야 한다)
import { buildRankingQuery, buildScoreQuery } from "@/entities/prediction/api/list-query";
import { buildPredictionScore } from "@/entities/prediction/api/mappers";
import type { PredictionScore } from "@/entities/prediction/model/types";
import { RankingView } from "@/views/ranking";

const TITLE = "예측 랭킹";
const DESCRIPTION = "이적 딜이 이번 창 안에 성사될지 예측하고, 가장 잘 맞힌 팬의 순위를 봅니다.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: ROUTES.ranking },
  // ⚠ openGraph를 채우는 순간 루트 이미지 상속이 사라지므로 `images`를 함께 명시한다
  openGraph: {
    ...OG_SITE,
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl(ROUTES.ranking),
    images: OG_IMAGE,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: OG_IMAGE },
};

interface RankingHead {
  /** 프리페치 결과 — 실패하면 undefined를 넘겨 클라이언트 조회로 폴백한다 */
  ranking?: PredictionScore[];
  userId: string | undefined;
  /**
   * 로그인 사용자의 점수 — `null`은 "채점된 표가 없다", `undefined`는 "프리페치 안 함(비로그인·실패)"이다.
   * 상위 `RANKING_LIMIT` 밖이면 "내 순위" 칸이 이것으로 그려진다(안 내리면 하이드레이션 뒤 스켈레톤에서 바뀐다).
   */
  myScore?: PredictionScore | null;
  /** 이 데이터를 읽은 시각 — 회차 안내와 신선도의 기준. ⚠ 렌더 본문이 아니라 여기서 찍는다 */
  nowMs: number;
}

/**
 * ⚠ `cache()`로 감싼다 — 지금은 소비자가 `Page` 하나지만 메타데이터를 동적으로 바꾸는 순간 요청당 2회가 된다.
 *
 * ⚠ **랭킹은 항상 익명 클라이언트로 받는다** — 공개 표(`using (true)`)이고 `auth.uid()`를 보지 않아 누가 열든 같다
 *   (`app/sitemap.ts`와 같은 갈림 없는 익명 조회). Data Cache를 타 순위가 최대 `ANON_REVALIDATE`만큼 늦게 보인다 —
 *   점수는 어차피 매시 채점이다.
 * ⚠ 세션이 있을 때만 쿠키 클라이언트로 사용자를 확인한다 — "나" 표시를 서버 HTML에 함께 그리기 위해서다.
 *   그래서 이 라우트는 동적(`ƒ`)이다.
 * ⚠ 내 점수도 함께 받는다 — 사용자 확인 **뒤에 이어** 랭킹과 나란히 보낸다(랭킹을 기다리지 않는다). 점수 표도 공개라
 *   익명 클라이언트다. 내가 상위 목록 안에 있으면 쓰이지 않지만, 그걸 알려면 랭킹을 기다려야 해서 늘 받는다(한 줄이다).
 *   점수 조회가 실패해도 랭킹은 그대로 내보낸다(곁다리 조회 — `undefined`로 두면 클라이언트가 받는다).
 */
const fetchRanking = cache(async (): Promise<RankingHead> => {
  const nowMs = Date.now();
  try {
    const anon = createSupabaseAnonClient();
    if (!anon) return { userId: undefined, nowMs };
    const signedIn = await hasSessionCookie();
    const mine = async () => {
      if (!signedIn) return { userId: undefined, myScore: undefined };
      const server = await createSupabaseServerClient();
      // `getClaims()` — 서명 키로 토큰을 로컬 검증해 GoTrue 왕복이 점수 조회 앞에 직렬로 붙지 않는다(`proxy.ts` 주석)
      const userId = (await server?.auth.getClaims())?.data?.claims.sub;
      if (!userId) return { userId: undefined, myScore: undefined };
      const score = await buildScoreQuery(anon, userId);
      if (score.error) {
        console.error("[ranking] 내 점수 조회 실패:", score.error);
        return { userId, myScore: undefined };
      }
      return { userId, myScore: score.data ? buildPredictionScore(score.data) : null };
    };
    const [result, { userId, myScore }] = await Promise.all([buildRankingQuery(anon), mine()]);
    if (result.error) return { userId, myScore, nowMs };
    return { ranking: (result.data ?? []).map(buildPredictionScore), userId, myScore, nowMs };
  } catch (e) {
    // cookies()가 던지는 프레임워크 내부 에러를 삼키면 라우트가 조용히 정적 프리렌더된다
    unstable_rethrow(e);
    console.error("[ranking] 랭킹 조회 실패:", e);
    return { userId: undefined, nowMs };
  }
});

export default async function Page() {
  const { ranking, userId, myScore, nowMs } = await fetchRanking();
  return (
    <RankingView
      initialRanking={ranking}
      initialUserId={userId}
      initialMyScore={myScore}
      serverNowMs={nowMs}
    />
  );
}
