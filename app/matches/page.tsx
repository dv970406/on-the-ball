import { cache } from "react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { ROUTES } from "@/shared/config";
import { createSupabaseServerClient } from "@/shared/api/supabase-server";
// ⚠ 배럴이 아니라 직접 경로 — 매퍼·빌더는 "use client"가 없어 서버에서 쓸 수 있다.
//   select 문자열·정렬·상한을 클라이언트 훅과 **공유해야** 같은 목록이 나온다.
import { buildMatch } from "@/entities/match/api/mappers";
import { buildMatchListQueries } from "@/entities/match/api/list-query";
import type { MatchListPage } from "@/entities/match/model/types";
import { MatchListView } from "@/views/match-list";

export const metadata: Metadata = {
  title: "승부예측",
  // ⚠ 정렬·필터가 없어도 자기 참조 canonical을 둔다 — 임의의 쿼리(`?utm_…`)가 붙은 URL이
  //   별개 페이지로 색인되는 것을 막는다(다른 목록과 같은 처리).
  alternates: { canonical: ROUTES.matchList },
  // description을 적지 않는다 — 루트 layout의 값을 상속한다.
};

interface MatchList {
  page?: MatchListPage;
  userId: string | undefined;
  /**
   * 이 목록을 읽은 시각 — 카드의 킥오프 표기가 연도를 붙일지 정한다.
   * ⚠ 렌더 본문이 아니라 여기서 찍는다(`react-hooks/purity`가 서버 컴포넌트에서도 막는다).
   * ⚠ **두 조회가 같은 값을 봐야 한다** — 지난/다가오는 경계를 서로 다른 순간으로 재면
   *   그 사이 경기가 양쪽에 다 실리거나 어디에도 안 실린다.
   */
  nowMs: number;
}

const fetchMatchList = cache(async (): Promise<MatchList> => {
  const nowMs = Date.now();
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { userId: undefined, nowMs };

    // ⚠ 쿠키 기반 클라이언트라 `auth.uid()`가 잡힌다 → `match_prediction` 임베딩("내 행만")이
    //   그 사용자 기준으로 채워져 카드의 내 예측 표시가 서버·클라에서 갈리지 않는다.
    // ⚠ 두 요청은 서로의 결과를 쓰지 않는다 → **병렬로** 보낸다.
    // ⚠ 목록 조립은 `buildMatchListQueries`가 소유한다 — 구역별 상한까지 그 안에 있다.
    const queries = buildMatchListQueries(supabase, nowMs);
    const [{ data: auth }, past, upcoming] = await Promise.all([
      supabase.auth.getUser(),
      queries.past,
      queries.upcoming,
    ]);

    if (past.error ?? upcoming.error) return { userId: auth.user?.id, nowMs };
    return {
      page: {
        past: (past.data ?? []).map(buildMatch),
        upcoming: (upcoming.data ?? []).map(buildMatch),
      },
      userId: auth.user?.id,
      nowMs,
    };
  } catch (e) {
    // cookies()가 던지는 프레임워크 내부 에러를 삼키면 페이지가 스켈레톤 상태로 정적
    // 프리렌더되어 조용히 망가진다.
    unstable_rethrow(e);
    console.error("[matches] 목록 조회 실패:", e);
    return { userId: undefined, nowMs };
  }
});

export default async function Page() {
  const { page, userId, nowMs } = await fetchMatchList();
  return <MatchListView initialMatches={page} initialUserId={userId} serverNowMs={nowMs} />;
}
