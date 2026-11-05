"use client";

import { useRef, useState } from "react";
import {
  ReportFlowChart,
  type TransferDeal,
  type TransferDealListItem,
  type TransferReport,
  dealLeagueClubs,
  isSettledStage,
  } from "@/entities/transfer";
import { PredictionCard } from "@/features/predict-deal";
import { PushNudge, usePushNudge } from "@/features/push-notification";
import { WatchToggle } from "@/features/watch-transfer";
import { ROUTES, env } from "@/shared/config";
import type { CommentList } from "@/entities/comment";
import type { DealPrediction } from "@/entities/prediction";
import { cn, formatCount, useReferenceNowMs } from "@/shared/lib";
import { AdSlot, EmptyState, SignInDialog, StaleBanner, } from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";
import { useCommentDeletion } from "../model/use-comment-deletion";
import { useShareWelcome } from "../model/use-share-welcome";
import { useTransferDetail } from "../model/use-transfer-detail";
import { CommentDeleteDialog } from "./comment-delete-dialog";
import { CommentSection } from "./comment-section";
import { WIDE_CARD, WIDE_CARD_TITLE } from "./detail-card";
import { DetailAside } from "./detail-aside";
import { ClubLinksNav, DealHero, DetailSkeleton, PanelHeading, RelatedDealsSection } from "./detail-parts";
import { DetailTabs, detailPanelId, detailTabId, type DetailTabKey } from "./detail-tabs";
import { ReportTimeline } from "./report-timeline";
import { ShareWelcome } from "./share-welcome";
import { useWideLayout } from "./use-wide-layout";

interface TransferDetailViewProps {
  dealId: number;
  /**
   * 서버가 미리 조회한 딜. **색인 대상이라 초기 HTML에 선수·경로·이적료가 담기게 하는 장치다.**
   * ⚠ 서버 조회가 실패하면 `undefined`가 오고 화면은 클라이언트 쿼리로 폴백한다.
   * ⚠ `null`은 "없는 딜"이다 — 서버가 이미 404를 내므로 실제로는 오지 않지만 훅의 계약을 그대로 둔다.
   */
  initialDeal?: TransferDeal | null;
  /** 서버가 미리 조회한 보도 타임라인(최신순) */
  initialReports?: TransferReport[];
  /**
   * 서버가 미리 조회한 댓글. ⚠ 키가 userId로 스코프된다(내 표 임베딩) — `initialUserId`와 한 쌍이다.
   *   `undefined`면 클라이언트가 조회한다.
   */
  initialComments?: CommentList;
  /**
   * 서버가 미리 조회한 성사 예측(회차별 집계 + 내 표). ⚠ 키가 userId로 스코프된다 — `initialUserId`와 한 쌍이다.
   */
  initialPrediction?: DealPrediction;
  /**
   * 서버가 본 로그인 사용자.
   * ⚠ **이게 없으면 프리페치가 무의미해진다** — `transferKeys.detail`이 userId로 스코프돼 있어
   *   복원 전 `undefined` 키로 찾으면 서버가 채운 캐시에 닿지 못한다(`transferKeys.list`도 같다).
   */
  initialUserId?: string;
  /**
   * 서버가 렌더한 시점의 시각.
   * ⚠ 없으면 "업데이트 2시간 전"이 첫 렌더에 절대시각으로 나왔다가 마운트 직후 바뀌어 글자 폭이
   *   달라진다(시프트). 서버 시각으로 첫 렌더부터 상대시각을 그린다.
   */
  serverNowMs?: number;
  /**
   * 서버가 조회한 같은 구단의 다른 딜. `undefined`(조회 실패·프리페치 없음)나 빈 목록이면 섹션을 그리지 않는다.
   * ⚠ `initial*`이 아니다 — 쿼리 캐시에 넣지 않고 그대로 그린다(클라이언트 조회가 없다).
   */
  relatedDeals?: TransferDealListItem[];
}


/**
 * 이적 상세 — 선수 · 경로 · 이적료 · `댓글 | 보도 타임라인` + 관심 토글.
 *
 * 하단 탭바를 렌더하지 않는다(서브헤더 화면이다). 공유는 `SubHeader`가 갖는다.
 * 모델이 계산한 확률 카드·원화 환산은 두지 않는다(확률은 보류이고, 하드코딩 환율은 거짓 숫자다) — 대신 팬의 성사
 * 예측(`PredictionCard`)이 그 자리를 채운다. 팬 의견이라 사실처럼 읽히지 않는다. 알림 안내는 관심 목록에 담은
 * 직후에만 뜬다(`usePushNudge`). 공유 링크로 처음 온 비로그인 방문자에게는 같은 자리에 담기 안내가 한 번 뜬다
 * (`useShareWelcome` — 둘이 겹치면 알림 안내가 이긴다).
 *
 * **폭마다 배치가 다르다**(구성 요소는 같다):
 * - `<768px` — 한 열. 이름 · 경로 카드 · 이적료 카드 · 성사 예측 · 탭(댓글 | 보도 타임라인) · 하단 고정 관심 바.
 * - `md`(768–1023) — 같은 한 열을 가운데 720px로.
 * - `lg`(≥1024) — 가운데 최대 1240px. 위에 히어로(이름 | 큰 엠블럼 경로 | 이적료), 아래 2열 —
 *   본문(보도 흐름 → 보도 타임라인과 댓글을 **나란히**, 탭 없음) + 오른쪽 360px 곁 칸(관심 담기 · 계약 조건 · 관심 구단 · 성사 예측).
 *   하단 고정 바는 걷고 같은 토글을 곁 칸에 둔다.
 * ⚠ **DOM 순서가 곧 그 폭의 읽는 순서다**(키보드 Tab·스크린리더 — WCAG 2.4.3): 히어로 → 본문(보도 흐름 → 보도 타임라인 →
 *   댓글) → 곁 칸. 그리드 자리 지정으로 순서를 뒤집지 않는다 — 화면은 왼쪽 본문인데 Tab은 오른쪽 곁 칸부터 밟게 된다.
 *   두 폭의 순서가 갈리는 조각은 성사 예측 하나다(좁은 화면은 히어로와 탭 사이, 넓은 화면은 곁 칸 맨 아래) — 그 카드만 두 자리에
 *   한 벌씩 그리고 CSS로 하나만 보인다. 두 카드는 같은 쿼리 캐시를 읽고(표·집계가 갈리지 않는다), 연타 판정 ref는 각자 갖지만
 *   누를 수 있는 것이 보이는 한 벌뿐이다. 제목 id는 카드마다 `useId`라 겹치지 않는다.
 * ⚠ 폭에 따라 모양이 전혀 다른 조각(경로 카드 ↔ 큰 엠블럼, 이적료 카드 ↔ 이적료 블록 + 계약 조건, 하단 관심 바 ↔ 곁 칸 관심
 *   담기)도 둘 다 그리고 CSS로 하나만 보인다. 서버 HTML에는 둘 다 있다 — 상호작용이 있는 것(관심 토글·알림 안내 `PushNudge`·
 *   성사 예측)은 보이는 쪽만 누를 수 있다(`display: none`은 포커스·접근성 트리에서 빠진다). 두 벌의 알림 안내는 켜기 훅(과 그
 *   가드)을 각자 갖지만 누를 수 있는 것이 한 벌뿐이라 겹쳐 켜지지 않는다.
 * ⚠ 탭 역할은 폭을 따라 바뀐다(`useWideLayout`) — 두 패널은 좁은 화면에서만 `tabpanel`이다. 곁 칸은 넓은 화면에만 있다.
 * ⚠ **두 패널(댓글·보도 타임라인)을 모두 렌더한다** — 색인 대상 화면이라 비활성 탭을 조건부 렌더로 빼면 크롤러가 그 패널을
 *   보지 못한다(`nextjs.md` "탭으로 갈라도 HTML에는 전부 남긴다"). 아래 패널 주석의 `max-lg:hidden`도 함께 읽는다.
 * ⚠ 오버레이(로그인 안내·삭제 확인)는 **프레임 직속 자리에 한 벌씩**이다 — `Dialog`가 `absolute`라
 *   스크롤 영역(`<main>`) 안에 두면 스크롤한 만큼 화면 밖에 뜬다.
 */
export function TransferDetailView({
  dealId,
  initialDeal,
  initialReports,
  initialComments,
  initialPrediction,
  initialUserId,
  serverNowMs,
  relatedDeals,
}: TransferDetailViewProps) {
  // 조회·대기 판정은 `model/use-transfer-detail`이 소유한다
  const {
    deal: { data: deal, isLoading, error },
    reports,
    comments,
    prediction,
    session,
    refetch,
  } = useTransferDetail({
    dealId,
    initialDeal,
    initialReports,
    initialComments,
    initialPrediction,
    initialUserId,
    serverNowMs,
  });
  /** 댓글 탭 패널 — 삭제 확정·답글 대상 소실 뒤 포커스를 받는 자리(프로그램으로만) */
  const commentsPanelRef = useRef<HTMLDivElement>(null);
  /**
   * 삭제 흐름(확인 다이얼로그·답글 수 재확인·대상 소실·포커스)과 **화면에 그릴 목록**(지운 댓글을 뺀 것)은
   * 훅이 갖는다. 탭 건수·댓글 섹션이 모두 `deletion.visibleList`를 본다(같은 값에서 만든다).
   */
  const deletion = useCommentDeletion({
    dealId,
    list: comments.list,
    isPlaceholder: comments.isPlaceholder,
    userId: session.userId,
    refetch: comments.refetch,
    focusFallbackRef: commentsPanelRef,
  });
  const commentList = deletion.visibleList;
  /**
   * 비로그인이 누른 동작(`~하려면`) — 관심 토글·댓글 입력·답글·표가 **문구만 다른 한 벌**을 쓴다.
   * `null`이면 닫혀 있다. 뷰가 소유한다(`Dialog`가 `absolute`라 — `SignInDialog` 주석).
   */
  const [signInAction, setSignInAction] = useState<string | null>(null);
  /** 댓글이 기본 선택이다(좁은 화면의 탭 — 넓은 화면에서는 두 패널이 다 보여 이 값이 아무것도 가리지 않는다) */
  const [tab, setTab] = useState<DetailTabKey>("comments");
  /** 방금 담은 사람에게만 알림 안내를 낸다 — 판정(토스트가 걷힌 뒤 · 알림이 꺼져 있을 때)은 훅이 갖는다 */
  const nudge = usePushNudge({ dealId, watched: deal?.isWatched === true, userId: session.userId });
  /**
   * 공유 링크로 처음 온 비로그인 방문자에게 한 번 — 판정(주소·세션·처음인가)과 "봤다" 기록은 훅이 갖는다.
   * ⚠ 하이드레이션 뒤에만 참이 된다(서버 HTML에는 없다). 알림 안내와 같은 자리라 둘이 겹치면 알림 안내가 이긴다 —
   *   실제로는 겹치지 않는다(이건 비로그인, 그건 방금 담은 로그인 사용자).
   */
  const welcome = useShareWelcome({
    dealId,
    dealShown: Boolean(deal),
    watched: deal?.isWatched === true,
    status: session.status,
  });
  const showWelcome = welcome.show && !nudge.show;
  const nowMs = useReferenceNowMs(serverNowMs);
  /** ARIA 역할만 가른다 — 배치는 CSS가 한다. 서버·첫 렌더는 좁은 화면의 역할이다 */
  const wide = useWideLayout();

  const commentCount = commentList
    ? `${formatCount(commentList.comments.length)}${commentList.truncated ? "+" : ""}`
    : null;
  const reportCount = reports.list ? formatCount(reports.list.length) : null;
  const clubLinks = deal ? dealLeagueClubs(deal) : [];
  const watchToggle = deal && (
    <WatchToggle
      dealId={deal.id}
      watched={deal.isWatched}
      onSignInRequired={() => {
        // 공유 담기 안내가 권하던 바로 그 동작이다 — 그 안내는 걷고 로그인 안내가 이어받는다
        welcome.hide();
        setSignInAction("관심 목록에 담으려면");
      }}
      onWatched={nudge.onWatched}
    />
  );
  /** 성사 예측 — 결과가 나오면(합의 완료·오피셜) 닫힌다. 다음 창 일정이 없으면 카드가 그려지지 않는다. 두 자리에 한 벌씩(아래 주석) */
  const predictionCard = (className: string) =>
    deal && (
      <PredictionCard
        className={className}
        dealId={deal.id}
        settled={isSettledStage(deal.stage)}
        prediction={prediction.data}
        error={prediction.error}
        onRetry={() => prediction.refetch()}
        userId={session.userId}
        nowMs={nowMs}
        onSignInRequired={setSignInAction}
      />
    );

  return (
    <>
      <SubHeader title="딜 상세" fallbackHref={ROUTES.transferList} />

      {/*
        ⚠ **스크롤 영역이 여기 있어야 한다** — 루트 프레임이 `h-dvh … overflow-hidden`이라 `<main>`이
          스스로 스크롤하지 않으면 넘친 내용에 닿을 방법이 없다.
        ⚠ `pt-*`를 두지 않는다 — 위쪽 여백은 각 분기의 첫 요소가 진다.
        ⚠ 아래 `pb`는 하단 고정 바(관심 토글) 높이 + safe-area다 — 본문이 바에 가려지지 않게. 넓은 화면은 바가 없다.
      */}
      <main
        className={cn(
          // `lg:[container-type:size]` — 곁 칸의 높이 상한(`100cqh`)이 이 스크롤 영역의 높이를 잰다(아래 곁 칸 주석).
          //   높이는 flex가 정하므로(`flex-1 min-h-0`) 크기 봉쇄가 배치를 바꾸지 않는다
          "no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 lg:bg-canvas-soft lg:px-8 lg:pb-12 lg:[container-type:size]",
          // 알림 안내·공유 담기 안내가 뜨면 하단 바가 그만큼 높아진다 — 본문 끝이 바에 가려지지 않게 함께 늘린다.
          // 담기 안내는 두 줄이 기본이고 좁은 폰(360px 아래)에서 세 줄로 접힌다 — 세 줄 높이로 잡는다(남는 여백은 무해하다)
          nudge.show
            ? "pb-[calc(142px+env(safe-area-inset-bottom))]"
            : showWelcome
              ? "pb-[calc(164px+env(safe-area-inset-bottom))]"
              : "pb-[calc(96px+env(safe-area-inset-bottom))]",
        )}
      >
        <div className="md:mx-auto md:max-w-[720px] lg:max-w-[1240px]">
          {/* 본문 h1(선수명)은 딜이 있을 때만 그려진다 — 로딩·실패·없음 분기에서는 sr-only로 둔다
              (EmptyState의 title은 <p>라 heading이 0개가 된다 — `app/not-found.tsx`와 같은 사정) */}
          {!deal && <h1 className="sr-only">딜 상세</h1>}
          {isLoading && <DetailSkeleton />}

          {/* ⚠ 에러 화면은 **보여줄 데이터가 없을 때만** 띄운다(`data-and-state.md`) */}
          {error && !deal && (
            <EmptyState
              className="pt-4"
              title="딜을 불러오지 못했어요"
              description={error.message}
              onRetry={() => refetch()}
            />
          )}
          {error && deal && (
            <div className="pt-4">
              <StaleBanner noun="딜" onRetry={() => refetch()} />
            </div>
          )}

          {deal === null && (
            <EmptyState
              className="pt-4"
              title="딜을 찾을 수 없어요"
              description="삭제됐거나 없는 딜이에요."
            />
          )}

          {deal && (
            <article
              className={cn(
                error ? undefined : "pt-4",
                "lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6 lg:pt-6",
              )}
            >
              <DealHero deal={deal} nowMs={nowMs} />

              {/* ── 본문 — 넓은 화면의 왼쪽 열. DOM에서 곁 칸보다 **앞**이다(위 컴포넌트 주석의 읽는 순서) ── */}
              <div className="lg:col-start-1 lg:row-start-2 lg:min-w-0">
                {/*
                  광고 — 히어로(경로·이적료) 아래, 본문 앞. 모든 폭에서 보이는 자리다 — 아래 탭 패널은 좁은 화면에서 CSS로 가려져
                  광고를 둘 수 없다(`AdSlot` 주석). 관심 토글·예측 버튼과는 카드 하나 이상 떨어져 있다.
                */}
                <AdSlot slot={env.adsenseSlots.dealDetail} className="mt-6 lg:mb-6 lg:mt-0" />
                {/* 보도 흐름 — 넓은 화면에만 둔다(좁은 화면은 지금 배치를 바꾸지 않는다) */}
                <section className={cn("hidden lg:block", WIDE_CARD)}>
                  <ReportFlowChart
                    title={<h2 className={WIDE_CARD_TITLE}>보도 흐름</h2>}
                    reports={reports.list}
                    error={reports.error}
                    onRetry={() => reports.refetch()}
                    nowMs={nowMs}
                  />
                </section>

                {/* 성사 예측(좁은 화면) — 히어로와 탭 사이. 넓은 화면은 곁 칸의 같은 카드가 보인다(위 컴포넌트 주석) */}
                {predictionCard("mt-3 lg:hidden")}

                {/* 탭은 좁은 화면에서만 — 넓은 화면은 두 패널을 나란히 다 보여 줘 고를 것이 없다 */}
                <DetailTabs
                  className="lg:hidden"
                  selected={tab}
                  onSelect={setTab}
                  tabs={[
                    // 댓글 + 답글 합계. 상한에 잘렸으면 `+`를 붙인다 — 받은 것만 센 숫자다
                    { key: "comments", label: "댓글", count: commentCount },
                    { key: "reports", label: "보도 타임라인", count: reportCount },
                  ]}
                />

                {/*
                  ⚠ **비활성 패널을 `hidden` 속성이 아니라 `max-lg:hidden` 클래스로 가린다.** 넓은 화면에서는 탭 없이 두 패널이
                    다 보여야 하는데, Tailwind preflight의 `[hidden] { display: none !important }`가 **base 레이어의 !important**라
                    어떤 유틸리티(`lg:block!`조차)로도 되살릴 수 없다(important 선언은 앞선 레이어가 이긴다). 클래스로 가려도
                    HTML에는 두 패널이 그대로 남는다(색인 규약은 지켜진다).
                  ⚠ 그래서 가린 패널에 display 유틸을 얹을 때 조심한다 — `lg:grid`처럼 **lg에만** 붙는 유틸이어야 `max-lg:hidden`과
                    부딪히지 않는다(접두어 없는 `flex`·`grid`를 얹으면 좁은 화면에서 가렸는데 보인다).
                  ⚠ **DOM 순서가 곧 넓은 화면의 좌우 순서다** — 보도 타임라인(왼쪽) → 댓글(오른쪽). 그리드 자리로 뒤집으면 키보드 Tab이
                    오른쪽 칸을 먼저 밟는다(WCAG 2.4.3). 좁은 화면은 한 번에 패널 하나만 보여 이 순서가 화면에 드러나지 않는다.
                  ⚠ `role="tabpanel"`은 **좁은 화면에서만** 단다(`wide`). 넓은 화면에는 탭 목록이 없는데(`lg:hidden`) 패널만 탭 패널이라
                    말하면, 숨은 탭 버튼에서 이름을 빌린 "고를 수 없는 탭"이 된다 — 틀린 ARIA는 없는 것보다 나쁘다. 넓은 화면의 패널은
                    역할 없이 자기 제목(h2)으로 읽힌다. 서버 HTML은 좁은 화면의 역할이다(폭을 모른다).
                */}
                <div className="lg:mt-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
                  <div
                    role={wide ? undefined : "tabpanel"}
                    id={detailPanelId("reports")}
                    aria-labelledby={wide ? undefined : detailTabId("reports")}
                    className={cn("lg:min-w-0", WIDE_CARD, tab !== "reports" && "max-lg:hidden")}
                  >
                    <PanelHeading count={reportCount}>보도 타임라인</PanelHeading>
                    <ReportTimeline
                      reports={reports.list}
                      error={reports.error}
                      onRetry={() => reports.refetch()}
                      nowMs={nowMs}
                    />
                  </div>

                  <div
                    ref={commentsPanelRef}
                    role={wide ? undefined : "tabpanel"}
                    id={detailPanelId("comments")}
                    aria-labelledby={wide ? undefined : detailTabId("comments")}
                    // 삭제 확정·답글 대상 소실 뒤 포커스를 받는 자리다(프로그램으로만 — Tab 순서에는 넣지 않는다)
                    tabIndex={-1}
                    className={cn("outline-none lg:min-w-0", WIDE_CARD, tab !== "comments" && "max-lg:hidden")}
                  >
                    <PanelHeading count={commentCount}>댓글</PanelHeading>
                    <CommentSection
                      dealId={dealId}
                      list={commentList}
                      isPlaceholder={comments.isPlaceholder}
                      error={comments.error}
                      onRetry={() => comments.refetch()}
                      status={session.status}
                      userId={session.userId}
                      nowMs={nowMs}
                      onSignInRequired={setSignInAction}
                      deletion={deletion.item}
                      confirmedDeletes={deletion.confirmedIds}
                      focusFallbackRef={commentsPanelRef}
                    />
                  </div>
                </div>

                <RelatedDealsSection deals={relatedDeals} nowMs={nowMs} />
                <ClubLinksNav clubs={clubLinks} />
              </div>

              <DetailAside
                deal={deal}
                watchToggle={watchToggle}
                note={
                  nudge.show ? (
                    <PushNudge className="mt-3 border-t border-hairline-cool pt-3" blocked={nudge.blocked} />
                  ) : showWelcome ? (
                    <ShareWelcome className="mt-3 border-t border-hairline-cool pt-3" onDismiss={welcome.dismiss} />
                  ) : null
                }
                predictionCard={predictionCard("lg:rounded-xl lg:bg-canvas lg:p-6")}
              />
            </article>
          )}
        </div>
      </main>

      {/*
        하단 고정 바 — `<main>`의 형제. z-60은 앱의 z 스케일
        (서브헤더 20 < 하단바 60~70 < 오버레이 80). 이 화면의 CTA는 관심 토글 하나뿐이고 에메랄드
        (활성 시 `primary`)는 `buttonClassName`이 갖는다 — 이 슬라이스에서 새로 칠하지 않는다.
        ⚠ 딜이 그려졌을 때만 둔다 — 로딩·에러·없음 화면에 눌러도 대상이 없는 버튼을 남기지 않는다.
        ⚠ 넓은 화면에서는 걷는다 — 같은 토글이 곁 칸에 있다(둘 다 마운트되고 보이는 쪽 하나만 누를 수 있다).
      */}
      {deal && (
        <footer
          // 안내 줄로 바가 높아진 동안 토스트가 그 위로 뜨게 하는 표지(`ToastViewport` 주석)
          data-bottom-bar={nudge.show || showWelcome ? "tall" : undefined}
          className="absolute inset-x-0 bottom-0 z-[60] border-t border-hairline-cool bg-canvas px-4 pb-[max(30px,env(safe-area-inset-bottom))] pt-2.5 lg:hidden">
          <div className="md:mx-auto md:max-w-[720px]">
            {/* 방금 담은 사람에게만 — 알림이 꺼져 있거나 켤 수 없는 이유를 알려야 할 때(`usePushNudge` 주석) */}
            {nudge.show && <PushNudge blocked={nudge.blocked} />}
            {/* 공유 링크로 처음 온 비로그인 방문자에게 한 번(`useShareWelcome` 주석) — 토글 위, 알림 안내와 같은 자리 */}
            {showWelcome && <ShareWelcome className="mb-2.5" onDismiss={welcome.dismiss} />}
            {watchToggle}
          </div>
        </footer>
      )}

      {/*
        로그인 안내 — 프레임 직속 자리에 한 벌. `<main>`·하단 바 밖이라야 `absolute` 기준이
        프레임이 된다(`SignInDialog` 주석). 로그인 뒤 이 상세로 돌아온다.
      */}
      <SignInDialog
        open={signInAction !== null}
        onClose={() => setSignInAction(null)}
        action={signInAction ?? ""}
        // `next`를 주지 않는다 — 기본값(지금 화면)이라 문구가 "이 화면으로 돌아와요"가 된다.
        // 주면 "이어서 진행할 수 있어요"가 나오는데, 로그인하고 돌아와도 누른 동작은 이어지지 않는다
      />

      <CommentDeleteDialog dialog={deletion.dialog} />
    </>
  );
}
