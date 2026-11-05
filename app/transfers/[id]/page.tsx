import { cache } from "react";
import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
// ⚠ **새 파서를 만들지 않는다.** 하는 일이 "URL의 [id] → 엄격한 십진수 id"라 게시글 전용이
//   아니고, 이름은 첫 호출자를 기록할 뿐이다.
import { parsePostId } from "@/shared/lib/post-id";
import { NOT_FOUND_METADATA, ROUTES } from "@/shared/config";
import { createSupabaseServerClient, hasSessionCookie } from "@/shared/api/supabase-server";
// ⚠ 배럴이 아니라 직접 경로 — 조립·매퍼·단계 라벨은 "use client"가 없어 서버에서 쓸 수 있다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { buildDealQuery, buildRelatedDealsQuery, buildReportsQuery } from "@/entities/transfer/api/list-query";
import { buildDeal, buildDealListItem, buildReport } from "@/entities/transfer/api/mappers";
// 제목·설명은 보드의 `?deal=` 공유와 같은 함수다 — 같은 딜이 어느 주소로 공유되든 같은 말을 한다
import { dealMetaDescription, dealMetaTitle, dealShareCard } from "@/entities/transfer/lib/deal-meta";
import type { TransferDeal, TransferDealListItem, TransferReport } from "@/entities/transfer/model/types";
import { buildCommentListQuery } from "@/entities/comment/api/list-query";
import { buildCommentList } from "@/entities/comment/api/mappers";
import type { CommentList } from "@/entities/comment/model/types";
import { buildMyPredictionsQuery, buildTallyQuery } from "@/entities/prediction/api/list-query";
import { buildDealPrediction } from "@/entities/prediction/api/mappers";
import type { DealPrediction } from "@/entities/prediction/model/types";
import { TransferDetailView } from "@/views/transfer-detail";
import { prefetchedRows } from "@/shared/api/prefetch";

/**
 * 조회가 실패했을 때(`unknown`) — 화면은 200으로 뜨고 클라이언트 조회로 폴백한다.
 * ⚠ canonical은 id만으로 만들 수 있으니 이때도 싣는다 — 일시 장애 중에 크롤러가 오면 추적 파라미터가 붙은 주소가
 *   별개 페이지로 색인되지 않게.
 */
function fallbackMetadata(dealId: number): Metadata {
  return { title: "딜 상세", alternates: { canonical: ROUTES.transfer(dealId) } };
}

type DealHead =
  | {
      state: "found";
      deal: TransferDeal;
      /**
       * 보도 타임라인(최신순).
       * ⚠ `undefined`(조회 실패)와 `[]`(받았는데 없다)를 가른다 — 곁다리 조회가 실패해도 본문은
       *   그대로 내보내고 타임라인만 클라이언트 조회로 미룬다(`nextjs.md`).
       */
      reports: TransferReport[] | undefined;
      /**
       * 댓글 — 타임라인과 같은 곁다리다. 실패하면 `undefined`(클라이언트가 조회한다), 없으면 빈 목록.
       * ⚠ 키가 userId로 스코프된다(내 표 임베딩이 "내 행만") — 아래 `userId`와 한 쌍이다.
       */
      comments: CommentList | undefined;
      /**
       * 성사 예측(회차별 집계 + 내 표) — 곁다리다. 실패하면 `undefined`(클라이언트가 조회한다).
       * ⚠ 내 표가 "내 행만"이라 키가 userId로 스코프된다 — 아래 `userId`와 한 쌍이다.
       */
      prediction: DealPrediction | undefined;
      /**
       * 같은 구단의 다른 딜 — 곁다리다. 실패하면 `undefined`(섹션을 그리지 않는다 — 클라이언트 조회로 미루지 않는다).
       * 상세가 다른 딜로 가는 **크롤 경로**라 서버 HTML에 실려야 뜻이 있다.
       */
      related: TransferDealListItem[] | undefined;
      /** ⚠ 쿼리 키가 userId로 스코프된다 — 그 값도 함께 내려야 캐시에 닿는다 */
      userId: string | undefined;
      /**
       * 이 데이터를 읽은 시각 — "업데이트 N분 전"을 첫 렌더부터 상대시각으로 그린다.
       * ⚠ 렌더 본문이 아니라 여기서 찍는다(`react-hooks/purity`가 서버 컴포넌트도 막는다).
       */
      nowMs: number;
    }
  | { state: "missing" }
  /** 조회 자체가 실패 — 일시 장애로 멀쩡한 딜을 없다고 단정하면 안 되므로 구분한다 */
  | { state: "unknown" };

/**
 * 같은 구단의 다른 딜. 구단은 출발과 행선지(없으면 가장 유력한 관심 구단)다.
 *
 * ⚠ **딜 조회 뒤에 직렬로 간다** — 딜의 구단을 알아야 물을 수 있다. 같은 리전의 DB 왕복 하나라 첫 바이트에 더해지는 것은 작다.
 * ⚠ 딜과 **같은 쿠키 클라이언트**다 — 카드가 관심 표시(`isWatched`, "내 행만" 임베딩)를 그리므로 로그인 사용자에게 익명 응답을
 *   주면 담은 딜의 표시가 빠진다.
 * ⚠ 실패해도 본문은 그대로 내보낸다(곁다리) — `undefined`로 접는다.
 */
async function fetchRelatedDeals(
  supabase: SupabaseClient<Database>,
  deal: TransferDeal,
): Promise<TransferDealListItem[] | undefined> {
  const codes = [deal.fromClub?.code, (deal.toClub ?? deal.suitors[0])?.code].filter((c): c is string => !!c);
  if (codes.length === 0) return [];
  const { data, error } = await buildRelatedDealsQuery(supabase, deal.id, codes);
  if (error) {
    console.error("[transfers/[id]] 관련 딜 조회 실패:", error);
    return undefined;
  }
  return data.map(buildDealListItem);
}

/**
 * 딜 단건 + 같은 구단의 다른 딜. 관련 딜은 딜의 구단을 알아야 물을 수 있어 **딜 조회에만** 직렬로 붙인다 — 곁다리 조회
 * (타임라인·댓글·예측)를 기다리지 않게 이 Promise째 `Promise.all`에 넣는다.
 * ⚠ 쿼리 빌더는 `await`할 때마다 요청을 새로 보낸다 — 빌더는 여기서 한 번만 기다리고 바깥에는 이 Promise만 넘긴다.
 */
async function fetchDealWithRelated(
  supabase: SupabaseClient<Database>,
  dealId: number,
): Promise<{ state: "unknown" | "missing" } | { state: "found"; deal: TransferDeal; related: TransferDealListItem[] | undefined }> {
  const { data, error } = await buildDealQuery(supabase, dealId);
  if (error) {
    console.error("[transfers/[id]] 딜 조회 실패:", error);
    return { state: "unknown" };
  }
  if (!data) return { state: "missing" };
  const deal = buildDeal(data);
  return { state: "found", deal, related: await fetchRelatedDeals(supabase, deal) };
}

/**
 * ⚠ `cache()`로 감싼다 — `generateMetadata`와 `Page`가 같은 데이터를 쓰므로 감싸지 않으면
 *   조회가 **요청당 2번** 나간다.
 *
 * ⚠ **쿠키 클라이언트다.** `transfer_deal_watch(user_id)` 임베딩이 "내 행만"이라 응답이
 *   사용자별이다 → 익명 Data Cache 갈림(`hasSessionCookie()`)을 두지 않는다. 대가로 이 라우트는
 *   동적(`ƒ`)이다.
 */
const fetchDealHead = cache(async (dealId: number): Promise<DealHead> => {
  const nowMs = Date.now();
  try {
    const [supabase, signedIn] = await Promise.all([createSupabaseServerClient(), hasSessionCookie()]);
    if (!supabase) return { state: "unknown" };

    // 서로의 결과를 쓰는 조회가 없다 → **전부 병렬로** 보낸다. 직렬이면 왕복이 쌓인다.
    //   유일한 예외인 관련 딜은 딜 조회 뒤에만 붙는다(`fetchDealWithRelated`).
    // ⚠ 조립은 `buildDealQuery`·`buildReportsQuery`가 단독으로 소유한다 — 클라이언트 훅과 같은
    //   select·정렬이어야 하이드레이션 직후 타임라인이 재배열되지 않는다.
    const [
      { data: auth },
      head,
      reportsResult,
      commentsResult,
      tallyResult,
      myPredictionsResult,
    ] = await Promise.all([
      // `getClaims()` — 서명 키로 토큰을 로컬 검증한다(GoTrue 왕복 없음 — `proxy.ts` 주석)
      supabase.auth.getClaims(),
      fetchDealWithRelated(supabase, dealId),
      buildReportsQuery(supabase, dealId),
      // ⚠ 조립·자르기·뒤집기는 클라이언트 훅과 같은 함수다 — 갈리면 하이드레이션 직후 목록이 흔들린다
      buildCommentListQuery(supabase, dealId),
      // ⚠ 예측도 클라이언트 훅과 같은 조립이다. 내 표는 세션 쿠키가 없으면 묻지 않는다(정책상 늘 빈 배열 — 훅이 비로그인 키에서
      //   건너뛰는 것과 같은 결과다). 판정은 쿠키만 본다 — `getUser()`를 기다리면 병렬이 직렬이 된다
      buildTallyQuery(supabase, dealId),
      buildMyPredictionsQuery(supabase, dealId, signedIn),
    ]);

    if (head.state !== "found") return { state: head.state };
    const { deal, related } = head;

    // ⚠ 곁다리 조회가 실패해도 **본문은 그대로 내보낸다** — 타임라인만 접는다(`undefined`).
    //   `[]`로 접으면 "보도가 없다"는 다른 뜻이 되어 화면이 거짓말한다.
    const reports = prefetchedRows("[transfers/[id]] 보도 타임라인 조회", reportsResult)?.map(buildReport);
    const commentRows = prefetchedRows("[transfers/[id]] 댓글 조회", commentsResult);
    const comments = commentRows && buildCommentList(commentRows);
    const tallyRows = prefetchedRows("[transfers/[id]] 예측 집계 조회", tallyResult);
    const myPredictionRows = prefetchedRows("[transfers/[id]] 내 예측 조회", myPredictionsResult);
    const prediction = tallyRows && myPredictionRows && buildDealPrediction(tallyRows, myPredictionRows);

    return {
      state: "found",
      deal,
      reports,
      related,
      comments,
      prediction,
      userId: auth?.claims.sub,
      nowMs,
    };
  } catch (e) {
    // createSupabaseServerClient의 cookies()는 "이 라우트를 동적 렌더로 전환하라"는
    // Next 내부 에러를 throw해서 동작한다. 삼키면 페이지가 스켈레톤 상태로 정적
    // 프리렌더되어 조용히 망가지므로 반드시 되던진다.
    unstable_rethrow(e);
    console.error("[transfers/[id]] 이적 딜 조회 실패:", e);
    return { state: "unknown" };
  }
});

export async function generateMetadata(props: PageProps<"/transfers/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const dealId = parsePostId(id);
  // id 형식이 틀린 주소도 `Page`가 `notFound()`를 부른다 → 없는 딜과 같은 제목이어야 한다
  if (dealId === null) return NOT_FOUND_METADATA;

  const head = await fetchDealHead(dealId);
  if (head.state === "missing") return NOT_FOUND_METADATA;
  if (head.state !== "found") return fallbackMetadata(dealId);

  const { deal } = head;
  return {
    title: dealMetaTitle(deal),
    description: dealMetaDescription(deal, head.reports),
    // ⚠ 자기 참조 canonical — 추적 파라미터가 붙은 URL이 별개 페이지로 색인되는 것을 막는다.
    alternates: { canonical: ROUTES.transfer(dealId) },
    // ⚠ `images`를 넘기지 않는다 — 이 세그먼트의 이미지는 같은 폴더의 `opengraph-image.tsx`가 낸다(`dealShareCard` 주석)
    ...dealShareCard(deal, head.reports),
  };
}

export default async function Page(props: PageProps<"/transfers/[id]">) {
  const { id } = await props.params;
  const dealId = parsePostId(id);
  if (dealId === null) notFound();

  // ⚠ notFound()는 반드시 여기(세그먼트 렌더)에서 불러야 404가 나간다.
  //   generateMetadata에서 부르면 메타데이터 생성만 중단되고 응답은 200으로 나간다.
  const head = await fetchDealHead(dealId);
  if (head.state === "missing") notFound();

  // state가 "unknown"이면 404로 단정하지 않고 화면을 띄운다(클라이언트 조회로 폴백)
  const found = head.state === "found" ? head : undefined;
  return (
    <TransferDetailView
      dealId={dealId}
      initialDeal={found?.deal}
      initialReports={found?.reports}
      initialComments={found?.comments}
      initialPrediction={found?.prediction}
      initialUserId={found?.userId}
      serverNowMs={found?.nowMs}
      relatedDeals={found?.related}
    />
  );
}
