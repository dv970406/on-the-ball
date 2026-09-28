import { cache } from "react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { OG_IMAGE, OG_SITE, ROUTES, absoluteUrl, boardScopeStartMs } from "@/shared/config";
import { createSupabaseServerClient, hasSessionCookie } from "@/shared/api/supabase-server";
import { createSupabaseAnonClient } from "@/shared/api/supabase-anon";
// ⚠ 배럴이 아니라 직접 경로 — 매퍼·빌더·파서는 "use client"가 없어 서버에서 쓸 수 있다.
//   select 문자열·정렬·상한을 클라이언트 훅과 **공유해야** 같은 목록이 나온다.
import { buildDealListQuery } from "@/entities/transfer/api/list-query";
import { buildDealListItem } from "@/entities/transfer/api/mappers";
// URL 파라미터 해석 — 시트·정렬 링크가 만드는 값과 같은 판정이어야 한다
import { parseTransferClub, parseTransferLeague, parseTransferSort } from "@/entities/transfer/lib/league";
import type { TransferDealListItem } from "@/entities/transfer/model/types";
import { TransferBoardView } from "@/views/transfer-board";

const TITLE = "이적시장";
const DESCRIPTION = "프리미어리그·유럽 5대 리그 이적 소식을 단계별로 모아 봅니다.";

export const metadata: Metadata = {
  title: TITLE,
  // ⚠ 색인 대상 목록이라 description을 채운다 — 비우면 루트의 사이트 소개 한 줄이 이 화면의
  //   검색 결과 설명이 된다.
  description: DESCRIPTION,
  // ⚠ **canonical에서 리그·정렬·구단 쿼리를 항상 떨어뜨린다.** 같은 집합의 부분·순서만 다른 중복이라
  //   색인 대상이 아니다(글 목록의 정렬과 같은 처리). `noindex`를 함께 걸지 않는다.
  alternates: { canonical: ROUTES.transferList },
  // ⚠ openGraph를 채우는 순간 루트 이미지 상속이 사라지므로 `images`를 함께 명시한다.
  openGraph: {
    ...OG_SITE,
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl(ROUTES.transferList),
    images: OG_IMAGE,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: OG_IMAGE },
};

interface TransferBoard {
  /** 프리페치 결과 — 실패하면 undefined를 넘겨 클라이언트 조회로 폴백한다(nextjs.md) */
  deals?: TransferDealListItem[];
  userId: string | undefined;
  /**
   * 이 보드를 읽은 시각 — 상대시각·캐러셀 3일 판정·마감 카운트다운의 첫 값.
   * ⚠ 렌더 본문이 아니라 여기서 찍는다(`react-hooks/purity`가 서버 컴포넌트에서도 막는다).
   *   React `cache()`는 **요청 단위**라 Data Cache 나이와 무관하게 요청마다 새 값이다.
   */
  nowMs: number;
  /**
   * 보드 범위 시작(ISO) — 쿼리 키와 조회 조건이 **같은 문자열**을 본다.
   * ⚠ **분 단위로 내린다.** ms 시각이 URL에 실리면 익명 Data Cache가 매번 미스다(`nextjs.md`).
   *   지금 값은 창 개장 시각(정각)이라 내릴 것이 없지만, 호출부가 그 규약을 진다.
   */
  scopeStartIso: string;
}

/** 분 단위로 내린 ISO — 캐시 키가 요청 수만큼 늘지 않게 */
function toMinuteIso(ms: number): string {
  return new Date(Math.floor(ms / 60_000) * 60_000).toISOString();
}

/**
 * ⚠ `cache()`로 감싼다 — 지금은 소비자가 `Page` 하나라 필수는 아니지만, **메타데이터를
 *   동적으로 바꾸는 순간 요청당 2회가 된다.** 그때 잊지 않도록 미리 감싼다(다른 목록과 같다).
 *   인자가 없는 이유: 범위 시작이 `nowMs`에서 파생되는데 그 값을 렌더 본문에서 찍을 수 없어
 *   (`react-hooks/purity`) 둘 다 안에서 만든다 — 인자를 받게 되면 **원시값**으로 받는다.
 */
const fetchTransferBoard = cache(async (): Promise<TransferBoard> => {
  const nowMs = Date.now();
  const scopeStartIso = toMinuteIso(boardScopeStartMs(nowMs));
  try {
    /*
     * ⚠ **세션이 없으면 익명 클라이언트로 갈아탄다**(`hasSessionCookie()` 갈림).
     *   비로그인에게 이 보드는 모든 요청에 동일하다 — 관심 임베딩(`transfer_deal_watch`, "내 행만")이
     *   빈 배열이고 나머지 정책은 전부 `using (true)`다. 그래서 Data Cache를 태워 크롤러·비로그인의
     *   조회가 캐시 히트에서 DB를 타지 않게 한다.
     * ⚠ 판정은 쿠키만 본다 — 헛짚어도 평소 경로로 갈 뿐이다(사유는 `hasSessionCookie` 주석).
     * ⚠ `nowMs`는 Data Cache 밖(요청마다)이다 — 상대시각·3일 판정이 캐시 나이만큼 뒤처지지 않는다.
     */
    const signedIn = await hasSessionCookie();
    const supabase = signedIn ? await createSupabaseServerClient() : createSupabaseAnonClient();
    if (!supabase) return { userId: undefined, nowMs, scopeStartIso };

    // ⚠ 두 요청은 서로의 결과를 쓰지 않는다 → **병렬로** 보낸다. `getUser()`는 세션이 있을 때만 —
    //   익명 경로에 GoTrue 왕복을 붙일 이유가 없다.
    // ⚠ 목록 조립은 `buildDealListQuery`가 소유한다 — 서버가 정렬·상한·select를 다시 짜면
    //   하이드레이션 직후 목록이 재배열된다.
    const [auth, dealsResult] = await Promise.all([
      signedIn ? supabase.auth.getUser() : null,
      buildDealListQuery(supabase, scopeStartIso),
    ]);
    const userId = auth?.data.user?.id;

    if (dealsResult.error) return { userId, nowMs, scopeStartIso };
    return {
      deals: (dealsResult.data ?? []).map(buildDealListItem),
      userId,
      nowMs,
      scopeStartIso,
    };
  } catch (e) {
    // cookies()가 던지는 프레임워크 내부 에러를 삼키면 페이지가 스켈레톤 상태로 정적
    // 프리렌더되어 조용히 망가진다.
    unstable_rethrow(e);
    console.error("[transfers] 보드 조회 실패:", e);
    return { userId: undefined, nowMs, scopeStartIso };
  }
});

export default async function Page(props: PageProps<"/transfers">) {
  // ⚠ `useSearchParams`(클라이언트 훅)가 아니라 **서버 컴포넌트의 prop**이다 —
  //   훅을 쓰면 프리렌더가 CSR로 떨어진다(nextjs.md에서 금지).
  const { league: rawLeague, sort: rawSort, club: rawClub } = await props.searchParams;
  // 모르는 리그·정렬·구단은 전체·최신으로 폴백한다 — 파라미터 오염이 404를 양산하면 안 된다
  const league = parseTransferLeague(typeof rawLeague === "string" ? rawLeague : undefined);
  const sort = parseTransferSort(typeof rawSort === "string" ? rawSort : undefined);
  const club = parseTransferClub(typeof rawClub === "string" ? rawClub : undefined);

  const { deals, userId, nowMs, scopeStartIso } = await fetchTransferBoard();
  return (
    <TransferBoardView
      initialDeals={deals}
      initialUserId={userId}
      serverNowMs={nowMs}
      scopeStartIso={scopeStartIso}
      league={league}
      sort={sort}
      club={club}
    />
  );
}
