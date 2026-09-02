import { cache } from "react";
import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
// ⚠ **새 파서를 만들지 않는다.** 하는 일이 "URL의 [id] → 엄격한 십진수 id"라 게시글 전용이
//   아니고, 이름은 첫 호출자를 기록할 뿐이다. 판정이 갈리면 `/matches/2`·`/matches/002`가
//   같은 경기의 별칭 URL이 된다.
import { parsePostId } from "@/shared/lib/post-id";
import { NOT_FOUND_TITLE, OG_IMAGE, ROUTES } from "@/shared/config";
// ⚠ 배럴(@/shared/lib)이 아니라 직접 경로 — 배럴은 "use client" 훅을 포함한다.
import { clamp } from "@/shared/lib/text";
import { createSupabaseServerClient } from "@/shared/api/supabase-server";
import { createSupabaseAnonClient } from "@/shared/api/supabase-anon";
// ⚠ 배럴이 아니라 직접 경로 — 매퍼는 "use client"가 없어 서버에서 쓸 수 있다.
import {
  EVENT_SELECT,
  LINEUP_SELECT,
  MATCH_SELECT,
  STAT_SELECT,
  buildMatch,
  buildMatchEvent,
  buildMatchLineups,
  buildMatchPredictionResult,
  buildMatchStat,
} from "@/entities/match/api/mappers";
// ⚠ 배럴이 아니라 직접 경로 — `lib/open`에는 "use client"가 없어 서버 안전하다
//   (`app/posts/[id]/page.tsx`가 `lib/plain-summary`를 같은 형태로 가져온다).
import { isMatchOpen, isMatchSettled, isPredictionResultsOpen } from "@/entities/match/lib/open";
import type {
  Match,
  MatchEvent,
  MatchLineup,
  MatchPredictionResult,
  MatchStat,
} from "@/entities/match/model/types";
import { MatchDetailView } from "@/views/match-detail";

const FALLBACK_METADATA: Metadata = { title: "승부예측" };
/** 없는 경기 — `Page`가 `notFound()`를 부르므로 **404 화면과 같은 제목**이어야 한다. */
const NOT_FOUND_METADATA: Metadata = { title: NOT_FOUND_TITLE };
const META_TITLE_MAX = 60;

type MatchHead =
  | {
      state: "found";
      match: Match;
      /** ⚠ 쿼리 키가 userId로 스코프된다 — 그 값도 함께 내려야 캐시에 닿는다 */
      userId: string | undefined;
      /**
       * 예측 분포. **킥오프가 지났을 때만 채운다** — `undefined`면 클라이언트가 쿼리를
       * 켜지 않고 `PredictionBlock`이 "아직 볼 수 없다"로 읽는다. `[]`는 "열렸는데 0건"이라는
       * 다른 뜻이다.
       */
      results: MatchPredictionResult[] | undefined;
      /**
       * 확정 라인업.
       * ⚠ `undefined`(조회 실패)와 `[]`(받았는데 아직 발표 전)를 가른다 — 하나로 접으면
       *   라인업 없는 경기가 클라이언트에서 매번 재조회된다.
       * ⚠ 게이팅이 시각이 아니라 **행의 존재**다(킥오프 20~40분 전에 도착하고, 연기·취소된
       *   경기에는 영영 오지 않는다) → 조건 없이 쏘고 온 것을 그대로 넘긴다.
       */
      lineups: MatchLineup[] | undefined;
      /** 득점·카드·교체. 라인업과 같은 이유로 `undefined`(실패)와 `[]`(아직 없음)를 가른다 */
      events: MatchEvent[] | undefined;
      /** 팀 스탯. 라인업·사건과 같은 규약 */
      stats: MatchStat[] | undefined;
      /**
       * 이 데이터를 읽은 시각.
       * ⚠ **없으면 킥오프가 지난 경기가 예측 가능한 상태로 SSR된다** — `MatchPrediction`의
       *   `useNowMs()`가 서버에서 `null`이라 잠금 분기를 타지 못한다.
       * ⚠ 렌더 본문이 아니라 여기서 찍는다(`react-hooks/purity`가 서버 컴포넌트도 막는다).
       */
      nowMs: number;
    }
  | { state: "missing" }
  /** 조회 자체가 실패 — 일시 장애로 멀쩡한 경기를 없다고 단정하면 안 되므로 구분한다 */
  | { state: "unknown" };

/**
 * ⚠ `cache()`로 감싼다 — `generateMetadata`와 `Page`가 같은 데이터를 쓰므로 감싸지 않으면
 *   조회가 **요청당 2번** 나간다.
 *
 * ⚠ **대진·스코어까지 여기서 조회한다.** 크롤러가 받는 HTML이 스켈레톤뿐이면 안 된다.
 */
const fetchMatchHead = cache(async (matchId: number): Promise<MatchHead> => {
  const nowMs = Date.now();
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { state: "unknown" };

    /*
     * 라인업·사건·스탯은 **쿠키 클라이언트로 보내지 않는다.**
     *
     * ⚠ 세 테이블의 SELECT 정책이 전부 `using (true)`이고 어디에도 `auth.uid()`가 없다 →
     *   **로그인 여부와 무관하게 응답이 같다.** 그래서 `hasSessionCookie()` 갈림조차 필요
     *   없이 항상 익명 클라이언트로 보내도 뜻이 달라지지 않고, 그 fetch가 Next Data Cache를
     *   탄다(`nextjs.md`의 "익명 조회는 캐시한다" — `app/posts/list-page.tsx`가 선례).
     * ⚠ `ANON_REVALIDATE`가 TanStack `staleTime`과 **같은 값**이라 두 캐시의 나이도 어긋나지
     *   않는다. 하나를 바꾸면 둘을 함께 바꾼다.
     * ⚠ **`match`·분포 RPC·`getUser()`는 여기 못 낀다** — `match_prediction` 임베딩이 "내 행만"
     *   이고 RPC도 사용자별이라 개인화가 섞여 있다(같은 절의 "개인화가 섞인 조회에는 쓰지 않는다").
     * ⚠ 익명 클라이언트가 없으면(env 미설정) 쿠키 클라이언트로 폴백한다 — 캐시를 못 탈 뿐 뜻은 같다.
     */
    const publicDb = createSupabaseAnonClient() ?? supabase;

    // ⚠ 쿠키 기반 클라이언트라 `auth.uid()`가 잡힌다 → `match_prediction` 임베딩("내 행만")이
    //   그 사용자 기준으로 채워져 `myPick`이 서버·클라에서 갈리지 않는다.
    // ⚠ 서로의 결과를 쓰는 조회가 하나도 없다 → **전부 병렬로** 보낸다. 직렬이면 왕복이 쌓인다.
    //   ⚠ 개수를 적지 않는다 — 한때 "셋은"·"넷째도"라고 적었는데 조회가 늘자 곧바로 거짓이 됐다.
    // ⚠ **분포도 무조건 함께 쏜다.** 게이팅이 UI가 아니라 definer 함수 안에 있어(킥오프 전에는
    //   0행) 조건 없이 쏴도 뜻이 달라지지 않는다 — 쓸지 말지의 판정은 아래에서 킥오프가 갖는다.
    //   조건부로 직렬화하면 **결과를 볼 수 있는 사용자만 TTFB에 왕복이 하나 더** 붙는데,
    //   그건 막대를 SSR로 그리려던 이유와 정면으로 부딪힌다.
    const [
      { data: auth },
      { data, error },
      { data: resultRows, error: resultsError },
      { data: lineupRows, error: lineupError },
      { data: eventRows, error: eventError },
      { data: statRows, error: statError },
    ] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("match").select(MATCH_SELECT).eq("id", matchId).maybeSingle(),
      supabase.rpc("match_prediction_results", { p_match_id: matchId }),
      // ⚠ 라인업·사건·스탯도 **같은 Promise.all에** 싣는다 — 직렬로 매달면 그 데이터가 있는
      //   경기만 TTFB에 왕복이 더 붙는데, 그건 이것들을 SSR로 그리려던 이유와 부딪힌다.
      publicDb.from("match_lineup").select(LINEUP_SELECT).eq("match_id", matchId),
      publicDb
        .from("match_event")
        .select(EVENT_SELECT)
        .eq("match_id", matchId)
        .order("minute", { ascending: true })
        .order("id", { ascending: true }),
      publicDb.from("match_stat").select(STAT_SELECT).eq("match_id", matchId),
    ]);

    if (error) return { state: "unknown" };
    if (!data) return { state: "missing" };

    const match = buildMatch(data);

    /**
     * ⚠ **킥오프가 지났을 때만 넘긴다.** `undefined`(조회 안 함)와 `[]`(열렸는데 0건)는
     *   **다른 뜻**이라, 킥오프 전에 오는 0행을 `[]`로 접으면 "0명이 예측했어요"라는
     *   거짓이 마감 전 화면에 뜬다.
     * ⚠ 취소된 경기도 제외한다 — 화면이 분포를 그리지 않는 상태와 판정을 맞춘다.
     */
    // ⚠ **판정을 여기서 다시 짜지 않는다.** 클라이언트가 부르는 것과 **같은 함수**여야 한다 —
    //   서버가 내려준 initialData는 클라이언트의 게이팅을 그대로 통과하므로, 두 곳이 각자
    //   조건을 조립하면 서버 판정이 클라 판정을 조용히 이긴다.
    // ⚠ **RPC 에러를 삼키면 `[]`가 되어 "0명이 예측했어요"라는 거짓이 나간다.**
    //   `undefined`(아직 못 봄)와 `[]`(열렸는데 0건)의 구분이 에러 경로에서 무너지는 자리다 —
    //   실측: RPC EXECUTE를 회수하니 화면이 전 항목 0% + "0명이 예측했어요"를 그렸다.
    //   ⚠ 클라이언트가 자가교정하지 못한다. `initialData: []`가 `staleTime` 안에서 fresh로
    //     앉아 마운트 시 리페치가 **아예 나가지 않고**(실측: 요청 0건), 그래서
    //     `resultsQuery.isError` 배너도 영영 뜨지 않는다. 크롤러 HTML에도 그대로 실린다.
    //   → 곁다리 조회가 실패하면 **본문은 그대로 내보내되**(`nextjs.md`) 분포만 접는다.
    const results =
      resultsError || !isPredictionResultsOpen(match, nowMs)
        ? undefined
        : (resultRows ?? []).map(buildMatchPredictionResult);

    // ⚠ 곁다리 조회가 실패해도 **본문은 그대로 내보낸다**(`nextjs.md`) — 라인업만 접는다.
    const lineups = lineupError ? undefined : buildMatchLineups(lineupRows ?? []);
    const events = eventError ? undefined : (eventRows ?? []).map(buildMatchEvent);
    const stats = statError ? undefined : (statRows ?? []).map(buildMatchStat);

    return {
      state: "found",
      match,
      userId: auth.user?.id,
      results,
      lineups,
      events,
      stats,
      nowMs,
    };
  } catch (e) {
    // createSupabaseServerClient의 cookies()는 "이 라우트를 동적 렌더로 전환하라"는
    // Next 내부 에러를 throw해서 동작한다. 삼키면 페이지가 스켈레톤 상태로 정적
    // 프리렌더되어 조용히 망가지므로 반드시 되던진다.
    unstable_rethrow(e);
    console.error("[matches/[id]] 경기 조회 실패:", e);
    return { state: "unknown" };
  }
});

export async function generateMetadata(props: PageProps<"/matches/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const matchId = parsePostId(id);
  if (matchId === null) return FALLBACK_METADATA;

  const head = await fetchMatchHead(matchId);
  if (head.state === "missing") return NOT_FOUND_METADATA;
  if (head.state !== "found") return FALLBACK_METADATA;

  const { match } = head;
  // ⚠ **클램프한다.** `team.name`은 DB CHECK가 100 코드포인트까지 허용해 대진 둘이면
  //   제목이 200자를 넘는다(실측 205자). 실데이터가 짧다는 것은 동기화 스크립트의 현재
  //   동작일 뿐이고(스크립트는 `name`을 자르지 않는다), `nextjs.md`의 "제목은 길이를
  //   클램프해서 넣는다"는 그 사정과 무관하게 성립한다 — 글 상세가 같은 처리를 한다.
  const title = clamp(`${match.homeTeam.name} vs ${match.awayTeam.name}`, META_TITLE_MAX);
  /*
   * ⚠ **판정을 여기서 또 짜지 않는다.** `homeScore !== null`만 보던 탓에 **취소된 경기와
   *   킥오프가 지난 경기의 공유 카드가 "결과를 예측해 보세요"라고 거짓말했다**(실측) —
   *   같은 페이지 본문은 "취소된 경기예요"를 그리고 버튼은 전부 disabled인데도.
   *   그 거짓이 `<meta name="description">`으로 **색인되고 카카오톡 공유 카드에 실린다** —
   *   앱 안의 불일치와 달리 밖으로 나간다.
   * ⚠ `head.nowMs`가 이미 손에 있으므로 화면과 같은 술어를 그대로 쓴다.
   */
  const round = `${match.season} ${match.matchday}R`;
  const description = match.isVoided
    ? `${round} · 취소된 경기`
    : isMatchSettled(match)
      ? `${round} · 최종 ${match.homeScore}-${match.awayScore}`
      : isMatchOpen(match, head.nowMs)
        ? `${round} · 결과를 예측해 보세요`
        : `${round} · 결과를 기다리는 중`;

  return {
    title,
    description,
    // ⚠ 자기 참조 canonical — 추적 파라미터가 붙은 URL이 별개 페이지로 색인되는 것을 막는다.
    alternates: { canonical: ROUTES.match(matchId) },
    // ⚠ **`images`를 명시한다.** 세그먼트가 `openGraph`를 채우면 루트의
    //   `app/opengraph-image.png` 상속이 통째로 대체되어 이미지가 빠진다(실측).
    openGraph: { type: "article", title, description, siteName: "온더볼", images: OG_IMAGE },
    twitter: { card: "summary_large_image", title, description, images: OG_IMAGE },
  };
}

export default async function Page(props: PageProps<"/matches/[id]">) {
  const { id } = await props.params;
  const matchId = parsePostId(id);
  if (matchId === null) notFound();

  // ⚠ notFound()는 반드시 여기(세그먼트 렌더)에서 불러야 404가 나간다.
  //   generateMetadata에서 부르면 메타데이터 생성만 중단되고 응답은 200으로 나간다.
  const head = await fetchMatchHead(matchId);
  if (head.state === "missing") notFound();

  // state가 "unknown"이면 404로 단정하지 않고 화면을 띄운다
  return (
    <MatchDetailView
      matchId={matchId}
      initialMatch={head.state === "found" ? head.match : undefined}
      initialUserId={head.state === "found" ? head.userId : undefined}
      initialResults={head.state === "found" ? head.results : undefined}
      initialLineups={head.state === "found" ? head.lineups : undefined}
      initialEvents={head.state === "found" ? head.events : undefined}
      initialStats={head.state === "found" ? head.stats : undefined}
      serverNowMs={head.state === "found" ? head.nowMs : undefined}
    />
  );
}
