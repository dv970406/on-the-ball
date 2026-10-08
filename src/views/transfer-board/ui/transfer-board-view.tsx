"use client";

import { useMemo, useState } from "react";
import {
  TRANSFER_DEAL_LIMIT,
  type TransferClub,
  type TransferDealListItem,
  type TransferLeague,
} from "@/entities/transfer";
import { openTransferWindow, trackedTransferWindow } from "@/shared/config";
import { cn, formatCount, useNowMs } from "@/shared/lib";
import { EmptyState, SignInDialog, StaleBanner } from "@/shared/ui";
import { AppBar } from "@/widgets/app-bar";
import { AuthStatus } from "@/widgets/auth-status";
import { BottomTabBar } from "@/widgets/bottom-tab-bar";
import { DealPanel } from "@/widgets/deal-panel";
import { TabScrollArea } from "@/widgets/tab-scroll-area";
import { boardHref } from "../lib/board-href";
import { groupLayout } from "../lib/screen-order";
import { navigateBoard, useBoardFilters } from "../model/use-board-filters";
import { useDealSelection } from "../model/use-deal-selection";
import { useTransferBoard } from "../model/use-transfer-board";
import { BoardHeader } from "./board-header";
import { BoardRail } from "./board-rail";
import { BoardSections } from "./board-sections";
import { FilterRail } from "./filter-rail";
import { GroupTabs } from "./group-tabs";
import { IndexBand } from "./index-band";
import { LeagueSheet } from "./league-sheet";
import { RumorCarousel } from "./rumor-carousel";
import { SortLinks } from "./sort-links";
import { TransferBoardSkeleton } from "./transfer-board-skeleton";
import { SPLIT_QUERY, useDealSelect } from "./use-deal-select";
import { useGroupJump } from "./use-group-jump";
import { useMediaQuery } from "./use-media-query";

interface TransferBoardViewProps {
  /** 서버 프리페치 결과 — 실패하면 undefined가 오고 클라이언트가 조회한다 */
  initialDeals?: TransferDealListItem[];
  /** 서버가 읽은 내 응원 구단 — 구단 칩의 순서를 첫 렌더부터 맞춘다(비로그인·조회 실패면 `undefined`) */
  initialFollowedClubs?: TransferClub[];
  /**
   * 서버가 본 로그인 사용자.
   * ⚠ 이게 없으면 프리페치가 무의미해진다 — `transferKeys.list`가 userId로 스코프돼 있어
   *   복원 전 `undefined` 키로 찾으면 서버가 채운 캐시에 닿지 못하고 다시 조회한다.
   */
  initialUserId?: string;
  /** 서버가 렌더한 시각 — 상대시각·캐러셀 3일 판정·마감 카운트다운의 첫 값이 이걸 본다 */
  serverNowMs?: number;
  /** 보드 범위 시작(분 단위 ISO) — 서버가 쿼리 키·조회 조건에 쓴 값 그대로다 */
  scopeStartIso: string;
}

/** 로그인 안내 한 벌의 내용 — 문구(`~하려면`)와 로그인 뒤 돌아올 곳 */
interface SignInPrompt {
  action: string;
  /** 없으면 지금 화면으로 돌아온다(`SignInDialog`) */
  next?: string;
}

/**
 * 이적시장 보드.
 *
 * 위→아래(모바일): 앱바 · 최근 3일 소식 캐러셀 · 이적시장 헤더(창 · 추적 건수 · 마감 카운트다운) ·
 * 구간 점프 탭 + 정렬(한 줄, `GroupTabs`) · 필터 레일(리그 버튼 + 관심 칩 + 구단 칩, `FilterRail`) ·
 * 구간들(긴 구간은 접혀 있다 — `BoardSections`).
 * ⚠ 이동·정렬·필터가 **각각 다른 형태**(밑줄 탭 · 텍스트 링크 · 칩)인 것이 규약이다 — 셋이 같은 칩 모양으로
 *   세 줄 쌓여 있을 때 전부 필터로 읽혔다.
 *
 * 폭이 늘면 **판을 늘린다 — 화면을 바꾸지 않는다**(같은 라우트·같은 데이터·같은 컴포넌트):
 * - md(768+): 목록 행이 표의 열로 펼쳐지고(`DealRow`), 소식이 한 줄 그리드가 된다.
 * - lg(1024+): 머리에 지수 띠(`IndexBand`), 오른쪽에 고른 딜의 판(`DealPanel`) — 목록·상세 2분할. 고른 딜은 주소의
 *   `?deal=`이 소유한다(`useDealSelection`). 딜 링크는 상세 주소를 가진 앵커로 남고 이 폭의 일반 클릭만 선택으로
 *   가로챈다(`useDealSelect`).
 * - `min-[90rem]`(1440px): 왼쪽 레일(`BoardRail` — 관심 딜·리그·구단)이 `FilterRail`을 대신한다(3분할).
 *   ⚠ `min-[1440px]`로 쓰지 않는다 — 단위가 다른 임의 브레이크포인트는 `md:`·`lg:`(rem)보다 **앞에** 정렬돼 같은 속성의
 *   `md:`·`lg:` 규칙에 진다(`styling.md`).
 * - 내용 폭은 1920px에서 멈추고 가운데 정렬한다.
 * ⚠ 모바일(<768)의 결과는 바꾸지 않는다 — 넓은 화면의 배치는 전부 `md:`·`lg:`·`min-[90rem]:` 접두어로만 더한다.
 * ⚠ **판은 늘 그린다 — 조회만 2분할일 때 연다**(`active`). 판의 머리는 목록 데이터만으로 서버 HTML에 실리고(넓은 화면의 LCP가
 *   판 제목이다), lg 미만에서는 CSS가 상자째 가린다. 판 안의 조회(보도·예측)는 `useMediaQuery`가 2분할을 확인한 뒤에만 열린다 —
 *   모바일에서 가려진 판이 조회를 내지 않게. 레일·판은 스크롤 영역(`TabScrollArea`) 안에서 `sticky`이고 높이는 데스크톱
 *   상단 바(56px + safe-area)를 뺀 화면 높이다.
 * ⚠ 판·레일·관심 칩에서 여는 로그인 안내는 **지금 보드 주소(필터 + 판에 열린 딜)**로 돌아온다 — 기본값(`/transfers`)이면
 *   로그인 뒤 필터가 풀리고 판이 첫 딜을 연다.
 *
 * ⚠ **첫 화면만 SSR이고 필터·정렬·선택은 서버를 부르지 않는다** — 서버는 범위 안 딜 전체를 한 번 내리고, 필터를 바꾸면
 *   주소만 바꿔(`navigateBoard`) 같은 목록으로 다시 계산한다. 서버가 새로 줄 것이 없는 이동에 서버 렌더를 기다리지 않는다.
 * ⚠ 로그인 안내는 **한 벌**이다(`SignInDialog`) — 관심 칩·레일의 관심 딜 자리·딜 판의 동작이 문구만 바꿔 쓴다.
 *   다이얼로그는 스크롤 영역 밖에 둔다.
 * ⚠ 이 슬라이스는 에메랄드·`rounded-full`·`shadow-`를 새로 쓰지 않는다 — 엔티티 컴포넌트가
 *   이미 갖는 자리(관심 표시·상태 뱃지·변동폭 화살표)가 전부다.
 */
export function TransferBoardView({
  initialDeals,
  initialFollowedClubs,
  initialUserId,
  serverNowMs,
  scopeStartIso,
}: TransferBoardViewProps) {
  // 필터(`?league=`·`?sort=`·`?club=`·`?watch=`)와 고른 딜(`?deal=`)은 **주소가 소유한다** — SSR 첫 렌더부터 화면 안 이동까지 소스가 하나다
  const { league, sort, club: requestedClub, watch, deal: requestedDeal } = useBoardFilters();

  // ⚠ **서버 시각이 우선이다** — `useNowMs()`는 세션당 한 번 고정되므로 클라 값을 앞에 두면
  //   낡은 시계가 갓 받은 서버 시각을 이긴다(`data-and-state.md`). `??`가 단축평가라 훅은
  //   먼저 무조건 부른다.
  const clientNowMs = useNowMs();
  const nowMs = serverNowMs ?? clientNowMs;

  // 조회·대기 판정·파생(캐러셀·구간·건수)은 `model/use-transfer-board`가 소유한다
  const { deals, rumors, groups, counts, filter, userId } = useTransferBoard({
    initialDeals,
    initialFollowedClubs,
    initialUserId,
    scopeStartIso,
    league,
    sort,
    club: requestedClub,
    watch,
    nowMs,
    serverNowMs,
  });
  const { clubOptions, club, watchedCount, isGuest } = filter;
  const allDeals = deals.data;

  // 구간마다의 화면 배치(소구간·열기 순) — 그리는 쪽과 판의 기본 선택이 **같은 결과**를 본다(`groupLayout`)
  const layouts = useMemo(() => groups.map((group) => groupLayout(group, nowMs, sort)), [groups, nowMs, sort]);

  /**
   * 2분할이 서 있는가 — 서버·첫 렌더는 늘 `false`다. 판 자체는 이 값과 무관하게 그린다(아래) — 이 값은 판이 조회를 열어도
   * 되는가(`active`)와 선택 표시(`aria-current`·막대)·주소 정리만 가른다. 모바일에는 "고른 딜"이라는 상태가 없다.
   */
  const split = useMediaQuery(SPLIT_QUERY);
  const { selectedDeal, select } = useDealSelection({
    deals: allDeals,
    layouts,
    requested: requestedDeal,
    league,
    sort,
    club,
    watch,
    enabled: split,
  });
  const selectedId = split ? (selectedDeal?.id ?? null) : null;

  const [leagueSheetOpen, setLeagueSheetOpen] = useState(false);
  // ⚠ 닫아도 내용은 남긴다 — 닫히는 애니메이션 동안 문구가 비면 글자가 깜빡인다
  const [signInPrompt, setSignInPrompt] = useState<SignInPrompt>({ action: "" });
  const [signInOpen, setSignInOpen] = useState(false);
  const promptSignIn = (prompt: SignInPrompt) => {
    setSignInPrompt(prompt);
    setSignInOpen(true);
  };
  // 구간 점프·활성 칩 판정(DOM 메커니즘)은 `use-group-jump`가 소유한다
  const {
    panelRef,
    active: activeGroup,
    jump,
  } = useGroupJump(groups.map((group) => group.key));
  const handleDealClickCapture = useDealSelect({
    enabled: split,
    selectedId,
    requestedId: requestedDeal,
    listRef: panelRef,
    onSelect: select,
  });

  /** 보도 수 막대의 기준 — 지금 보이는 목록의 최댓값 */
  const reportScale = useMemo(
    () => groups.reduce((max, g) => g.deals.reduce((m, d) => Math.max(m, d.reportCount), max), 0),
    [groups],
  );

  /** 리그는 URL이 소유한다 — `replace`라 뒤로가기 스택에 리그 변경이 쌓이지 않는다. 리그를 바꾸면 구단 필터는 푼다(다른 리그의 구단이다) */
  const handleLeagueSelect = (next: TransferLeague | null) => {
    setLeagueSheetOpen(false);
    if (next !== league) navigateBoard(boardHref(next, sort, null, watch), "replace");
  };
  /**
   * 로그인 뒤 돌아올 보드 주소 — 지금 필터에 **판에 열린 딜**까지 싣는다(2분할일 때만 — 모바일에는 고른 딜이 없다).
   * ⚠ 기본값(`/transfers`)으로 두면 로그인하고 돌아왔을 때 필터가 풀리고 판이 첫 딜을 연다 — 담으려던 딜이 아니다.
   *   주소에 딜이 없던 기본 선택도 id를 싣는다(로그인 뒤 목록이 달라져도 같은 딜이 열리게).
   */
  const returnHref = (nextWatch: boolean) =>
    boardHref(league, sort, club, nextWatch, split ? (selectedDeal?.id ?? null) : null);
  /**
   * 관심 딜 모아 보기의 로그인 안내.
   * ⚠ `next`를 준다 — 누른 것이 "관심 딜만 보기"라, 로그인하고 돌아오면 그 필터가 걸려 있어야 다시 누르지 않는다.
   */
  const promptWatchSignIn = () => promptSignIn({ action: "관심 딜을 모아 보려면", next: returnHref(true) });

  // ⚠ `nowMs`가 `null`인 것은 서버 시각 없이 마운트된 하이드레이션 전 한 프레임뿐이다(이 앱의
  //   page는 늘 내려준다). 그 프레임은 첫 창 이름을 그리고 카운트다운을 미룬다.
  const trackedWindow = trackedTransferWindow(nowMs ?? 0);
  // 카운트다운은 창이 **열려 있는 동안만** — 가장 먼저 여는 리그부터 가장 늦게 닫는 리그까지
  const openWindow = nowMs === null ? null : openTransferWindow(nowMs);

  return (
    <>
      <TabScrollArea>
        <AppBar leading={<AuthStatus />} />

        {/* ⚠ 화면 제목(h1)은 sr-only가 아니라 `BoardHeader`의 보이는 "이적시장"이다(lg+에서는 그 요소가 sr-only로 남는다) —
            이 화면은 제목을 실제로 그리므로 sr-only를 더 두면 같은 글자가 두 번 읽힌다.
            ⚠ 단 `BoardHeader`는 보드가 있을 때만 그려진다 — 로딩·조회 실패 분기에서는 h1이 0개가 되므로
              그때만 sr-only로 둔다(EmptyState의 title은 <p>다 — `app/not-found.tsx`와 같은 사정). */}
        {!allDeals && <h1 className="sr-only">이적시장</h1>}

        {deals.isLoading && <TransferBoardSkeleton />}

        {/*
          ⚠ 에러 화면은 **보여줄 데이터가 없을 때만** 띄운다. 리페치가 실패해도 data는 유지되므로,
            조건을 나누지 않으면 에러 박스와 정상 보드가 한 화면에 공존한다.
        */}
        {deals.error && !allDeals && (
          <EmptyState
            title="딜을 불러오지 못했어요"
            description={deals.error.message}
            onRetry={() => deals.refetch()}
          />
        )}

        {/* 캐시된 보드는 그대로 두고 최신화 실패만 알린다 */}
        {deals.error && allDeals && <StaleBanner noun="딜" onRetry={() => deals.refetch()} />}

        {allDeals && (
          // 계정이 바뀌는 동안(placeholderData) 이전 보드가 남아 있다는 걸 은은하게 알린다
          // 딜 링크의 클릭은 여기서 위임으로 받는다 — lg+의 일반 클릭만 선택으로 바뀐다(`useDealSelect`)
          <div
            onClickCapture={handleDealClickCapture}
            className={cn(
              "mx-auto flex w-full max-w-[1920px] flex-col transition-opacity duration-150 ease-otb",
              deals.isPlaceholderData && "opacity-50",
            )}
          >
            {/*
              ⚠ **DOM 순서 = 제목(h1) → 화면 순서다.** h1(`BoardHeader`)이 격자 **밖** 맨 앞에 서고, 격자 안은 화면에 놓인 순서
              그대로 레일 → 가운데 열 → 판이다 — 키보드 Tab이 화면 배치를 따라간다(WCAG 2.4.3). 칸 자리를 따로 적지 않는다
              (자동 배치가 곧 DOM 순서다). lg+에서 h1은 sr-only라 높이가 없다.
              lg 미만에서는 격자와 가운데 열이 상자 없이 풀려(`contents`) 그 자식들이 이 flex 열의 항목이 된다 — 그래서 소식
              캐러셀이 `order-first`로 제목 위에 보인다(모바일 화면은 소식 → 제목이다. 제목 블록에는 포커스 갈 곳이 없어
              Tab 순서는 화면과 같다).
            */}
            <BoardHeader
              label={trackedWindow.label}
              openWindow={openWindow}
              totalCount={allDeals.length}
              serverNowMs={serverNowMs ?? null}
            />

            <div className="contents lg:grid lg:grid-cols-[minmax(0,1fr)_384px] min-[90rem]:grid-cols-[232px_minmax(0,1fr)_384px]">
              {/* 왼쪽 레일 — 1440 미만에서는 상자째 없다(display:none). 높이는 상단 바(safe-area 포함)를 뺀 화면 높이 */}
              <div className="hidden border-r border-hairline-cool min-[90rem]:sticky min-[90rem]:top-0 min-[90rem]:block min-[90rem]:h-[calc(100dvh-56px-env(safe-area-inset-top))] min-[90rem]:self-start min-[90rem]:overflow-y-auto">
                <BoardRail
                  deals={allDeals}
                  clubOptions={clubOptions}
                  league={league}
                  sort={sort}
                  club={club}
                  watch={watch}
                  isGuest={isGuest}
                  selectedId={selectedId}
                  onWatchSignInRequired={promptWatchSignIn}
                />
              </div>

              {/* 가운데 열 — lg+에서 지수 띠 → 소식 → 목록 */}
              <div className="contents lg:flex lg:min-w-0 lg:flex-col">
                {/*
                  지수 띠는 가운데 열의 머리다 — 판 전체 폭으로 두면 레일·판이 그 높이만큼 아래에서 시작해, 높이가
                  화면 높이에서 상단 바를 뺀 판의 아래(관심 토글)가 첫 화면에서 잘린다.
                */}
                <IndexBand
                  deals={allDeals}
                  windowLabel={trackedWindow.label}
                  openWindow={openWindow}
                  serverNowMs={serverNowMs ?? null}
                />

                {/* 카드 0장이면 섹션 자체를 그리지 않는다 — 빈 캡션이 첫 화면 세로 공간을 먹지 않게 */}
                {rumors.length > 0 && (
                  <div className="order-first lg:order-none">
                    <RumorCarousel rumors={rumors} nowMs={nowMs} />
                  </div>
                )}

                {/* 구간 섹션들을 담으므로 점프 훅의 ref가 여기 붙는다. J/K는 포커스가 이 안에 있을 때만 듣는다(`useDealSelect`) */}
                <div ref={panelRef} className="md:pt-2">
                  <GroupTabs
                    counts={counts}
                    active={activeGroup}
                    onJump={jump}
                    trailing={<SortLinks league={league} sort={sort} club={club} watch={watch} />}
                  />
                  <FilterRail
                    options={clubOptions}
                    club={club}
                    league={league}
                    sort={sort}
                    watch={watch}
                    isGuest={isGuest}
                    onOpenLeague={() => setLeagueSheetOpen(true)}
                    onWatchSignInRequired={promptWatchSignIn}
                  />

                  {groups.length === 0 ? (
                    // 관심 필터가 켜져 있고 담은 딜이 하나도 없으면 "조건에 안 맞는다"가 아니라 "아직 담지 않았다"다 —
                    // 어디서 담는지를 함께 말한다. 담는 버튼은 딜 상세에도, 넓은 화면의 오른쪽 판에도 있어 "딜을 열고"로
                    // 쓴다(폭과 무관하게 맞는 문구). 담은 딜은 있는데 리그·구단 조건에 걸러진 것이면 아래 문구다.
                    watch && watchedCount === 0 ? (
                      <EmptyState
                        title="관심 목록이 비어 있어요"
                        description={
                          isGuest
                            ? "로그인하고 딜을 열어 관심 목록에 담으면 여기에 모여요."
                            : "딜을 열고 ‘관심 목록에 담기’를 누르면 여기에 모여요."
                        }
                      />
                    ) : (
                      <EmptyState title="조건에 맞는 딜이 없어요" />
                    )
                  ) : (
                    <BoardSections
                      layouts={layouts}
                      nowMs={nowMs}
                      sort={sort}
                      expanded={watch}
                      reportScale={reportScale}
                      selectedId={selectedId}
                    />
                  )}

                  {/*
                    잘림 안내 — 판정은 **응답 길이만으로** 한다(서버 카운트와 비교하면 리페치 시점이
                    달라 잘못된 안내가 뜬다). 리그 필터 전 전체 수가 기준이다 — 잘린 것은 응답이다.
                  */}
                  {allDeals.length >= TRANSFER_DEAL_LIMIT && (
                    <p className="px-5 pb-1 pt-4 text-center text-[12px] text-ink-mute-2">
                      딜은 {formatCount(TRANSFER_DEAL_LIMIT)}건까지만 표시하고 있어요.
                    </p>
                  )}
                </div>
              </div>

              {/*
                오른쪽 판 — **늘 그린다**(lg 미만은 CSS로 상자째 가린다). 판의 머리(뱃지·이름·경로·이적료)는 목록 데이터만으로
                서버 HTML에 실린다 — 넓은 화면의 LCP가 판 제목이라, 하이드레이션 뒤에 마운트하면 첫 페인트가 그만큼 늦다.
                판 안의 조회(보도·예측)는 2분할이 실제로 섰을 때만 연다(`active`) — 모바일에서 가려진 판이 조회를 내지 않게.
                ⚠ 판 안의 스크롤바를 숨기지 않는다 — 판 본문은 화면보다 길어(1440×900에서 본문 1203px · 보이는 높이 767px)
                  막대가 없으면 마우스 사용자가 더 내려갈 내용이 있다는 신호를 받지 못한다. 페이지(`main`) 막대와 오른쪽 끝에
                  나란히 서지만 판의 왼쪽 경계선이 두 스크롤 영역을 가른다.
              */}
              <div className="hidden border-l border-hairline-cool lg:sticky lg:top-0 lg:block lg:h-[calc(100dvh-56px-env(safe-area-inset-top))] lg:self-start">
                {selectedDeal ? (
                  <DealPanel
                    key={selectedDeal.id}
                    deal={selectedDeal}
                    userId={userId}
                    nowMs={nowMs}
                    active={split}
                    onSignInRequired={(action) =>
                      promptSignIn({ action, next: boardHref(league, sort, club, watch, selectedDeal.id) })
                    }
                  />
                ) : (
                  // 고를 딜이 없다(필터 결과 0건) — 빈 판 대신 이유를 한 줄로
                  <EmptyState
                    title="열어 볼 딜이 없어요"
                    description="조건을 바꾸면 목록의 딜이 여기에 열려요."
                    className="h-full"
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </TabScrollArea>

      <BottomTabBar />

      {/*
        ⚠ `TabScrollArea` **밖**이다 — `Sheet`가 `absolute`라 스크롤 영역 안에 두면 스크롤한 만큼
          화면 밖에 뜬다(`SignInDialog`를 밖에 두는 것과 같은 이유).
      */}
      <LeagueSheet
        open={leagueSheetOpen}
        league={league}
        onSelect={handleLeagueSelect}
        onClose={() => setLeagueSheetOpen(false)}
      />

      {/* 로그인 안내 — 프레임 직속 자리에 한 벌(`Dialog`가 `absolute`다). 문구·돌아올 곳만 자리마다 다르다 */}
      <SignInDialog
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
        action={signInPrompt.action}
        next={signInPrompt.next}
      />
    </>
  );
}
