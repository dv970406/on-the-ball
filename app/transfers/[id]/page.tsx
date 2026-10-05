import { cache } from "react";
import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
// ⚠ **새 파서를 만들지 않는다.** 하는 일이 "URL의 [id] → 엄격한 십진수 id"라 게시글 전용이
//   아니고, 이름은 첫 호출자를 기록할 뿐이다.
import { parsePostId } from "@/shared/lib/post-id";
import { NOT_FOUND_TITLE, OG_SITE, ROUTES, absoluteUrl } from "@/shared/config";
// ⚠ 배럴(@/shared/lib)이 아니라 직접 경로 — 배럴은 "use client" 훅을 포함한다.
import { clamp } from "@/shared/lib/text";
import { createSupabaseServerClient } from "@/shared/api/supabase-server";
// ⚠ 배럴이 아니라 직접 경로 — 조립·매퍼·단계 라벨은 "use client"가 없어 서버에서 쓸 수 있다.
import { buildDealQuery, buildReportsQuery } from "@/entities/transfer/api/list-query";
import { buildDeal, buildReport } from "@/entities/transfer/api/mappers";
import { STAGE_STATUS, STATUS_LABEL } from "@/entities/transfer/lib/stage";
import { routeLabels } from "@/entities/transfer/lib/route-label";
import { playerName } from "@/entities/transfer/lib/player-name";
import type { TransferDeal, TransferReport } from "@/entities/transfer/model/types";
import { buildCommentListQuery } from "@/entities/comment/api/list-query";
import { buildCommentList } from "@/entities/comment/api/mappers";
import type { CommentList } from "@/entities/comment/model/types";
import { TransferDetailView } from "@/views/transfer-detail";

const FALLBACK_METADATA: Metadata = { title: "딜 상세" };
/** 없는 딜·형식이 틀린 id — `Page`가 `notFound()`를 부르므로 **404 화면과 같은 제목**이어야 한다. */
const NOT_FOUND_METADATA: Metadata = { title: NOT_FOUND_TITLE };
const META_TITLE_MAX = 60;
const META_DESCRIPTION_MAX = 120;

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
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { state: "unknown" };

    // 서로의 결과를 쓰는 조회가 없다 → **전부 병렬로** 보낸다. 직렬이면 왕복이 쌓인다.
    // ⚠ 조립은 `buildDealQuery`·`buildReportsQuery`가 단독으로 소유한다 — 클라이언트 훅과 같은
    //   select·정렬이어야 하이드레이션 직후 타임라인이 재배열되지 않는다.
    const [
      { data: auth },
      { data, error },
      { data: reportRows, error: reportsError },
      { data: commentRows, error: commentsError },
    ] = await Promise.all([
      supabase.auth.getUser(),
      buildDealQuery(supabase, dealId),
      buildReportsQuery(supabase, dealId),
      // ⚠ 조립·자르기·뒤집기는 클라이언트 훅과 같은 함수다 — 갈리면 하이드레이션 직후 목록이 흔들린다
      buildCommentListQuery(supabase, dealId),
    ]);

    if (error) return { state: "unknown" };
    if (!data) return { state: "missing" };

    // ⚠ 곁다리 조회가 실패해도 **본문은 그대로 내보낸다** — 타임라인만 접는다(`undefined`).
    //   `[]`로 접으면 "보도가 없다"는 다른 뜻이 되어 화면이 거짓말한다.
    const reports = reportsError ? undefined : (reportRows ?? []).map(buildReport);
    const comments = commentsError ? undefined : buildCommentList(commentRows ?? []);

    return {
      state: "found",
      deal: buildDeal(data),
      reports,
      comments,
      userId: auth.user?.id,
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

/**
 * 공유 카드·검색 결과의 한 줄.
 *
 * 최신 보도의 요지(한국어 요약, 없으면 영문 발췌)가 있으면 그것을 쓴다 — 화면의 타임라인 첫 항목과 같은 문장이다.
 * 없으면 화면이 그리는 값(경로 + 상태 뱃지)으로 만든다(`nextjs.md` "색인 대상 상세는 description을
 * 채운다"). 어느 쪽이든 120자에서 클램프한다.
 * ⚠ 발췌는 줄바꿈을 담고 있을 수 있다(텔레그램 원문) — 메타 태그에 실릴 문장이라 공백 하나로 접는다.
 */
function describe(head: Extract<DealHead, { state: "found" }>): string {
  const gist = head.reports?.[0]?.gist?.text.replace(/\s+/g, " ").trim();
  if (gist) return clamp(gist, META_DESCRIPTION_MAX);

  const { deal } = head;
  const status = STAGE_STATUS[deal.stage];
  // 화면(경로 카드·`ClubRoute`)과 **같은 문구**다 — 빈 칸의 말(`FA`·`미확인`·`미정`·`외 N`)까지 `routeLabels`가 정한다.
  // 전에는 여기서 `미확인`을 따로 들어 자유계약·행선지 미정·관심 구단 여럿이 화면과 다르게 나갔다.
  const labels = routeLabels(deal, { full: true });
  const route = `${labels.from} → ${labels.to}`;
  return clamp(status === null ? route : `${route} · ${STATUS_LABEL[status]}`, META_DESCRIPTION_MAX);
}

export async function generateMetadata(props: PageProps<"/transfers/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const dealId = parsePostId(id);
  // id 형식이 틀린 주소도 `Page`가 `notFound()`를 부른다 → 없는 딜과 같은 제목이어야 한다
  if (dealId === null) return NOT_FOUND_METADATA;

  const head = await fetchDealHead(dealId);
  if (head.state === "missing") return NOT_FOUND_METADATA;
  if (head.state !== "found") return FALLBACK_METADATA;

  const { deal } = head;
  // ⚠ 클램프한다 — `player`는 DB가 길이를 넓게 허용하고, 화면 제목(`h1`)과 같은 값이다
  const title = clamp(`${playerName(deal)} 이적`, META_TITLE_MAX);
  const description = describe(head);

  return {
    title,
    description,
    // ⚠ 자기 참조 canonical — 추적 파라미터가 붙은 URL이 별개 페이지로 색인되는 것을 막는다.
    alternates: { canonical: ROUTES.transfer(dealId) },
    // ⚠ **`images`를 적지 않는다.** 이 세그먼트의 이미지는 같은 폴더의 `opengraph-image.tsx`(딜마다 그리는 카드)가
    //   낸다 — 여기에 `images`를 적으면 그 값이 파일 컨벤션을 **이겨서** 카드 대신 사이트 공통 이미지가 나간다(실측).
    //   `twitter:image`도 그 파일에서 함께 나온다. `og:url`은 Next가 만들어 주지 않아 직접 적는다.
    openGraph: {
      ...OG_SITE,
      type: "article",
      title,
      description,
      url: absoluteUrl(ROUTES.transfer(dealId)),
      // 화면이 그리는 값과 같은 판정 — "업데이트 N분 전"이 곧 최신 보도 시각이다
      modifiedTime: deal.latestReportedAt,
    },
    twitter: { card: "summary_large_image", title, description },
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
  return (
    <TransferDetailView
      dealId={dealId}
      initialDeal={head.state === "found" ? head.deal : undefined}
      initialReports={head.state === "found" ? head.reports : undefined}
      initialComments={head.state === "found" ? head.comments : undefined}
      initialUserId={head.state === "found" ? head.userId : undefined}
      serverNowMs={head.state === "found" ? head.nowMs : undefined}
    />
  );
}
