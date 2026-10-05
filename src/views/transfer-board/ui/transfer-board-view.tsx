"use client";

import { useState } from "react";
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
import { TabScrollArea } from "@/widgets/tab-scroll-area";
import { boardHref } from "../lib/board-href";
import { navigateBoard, useBoardFilters } from "../model/use-board-filters";
import { useTransferBoard } from "../model/use-transfer-board";
import { BoardHeader } from "./board-header";
import { BoardSections } from "./board-sections";
import { FilterRail } from "./filter-rail";
import { GroupTabs } from "./group-tabs";
import { LeagueSheet } from "./league-sheet";
import { RumorCarousel } from "./rumor-carousel";
import { SortLinks } from "./sort-links";
import { TransferBoardSkeleton } from "./transfer-board-skeleton";
import { useGroupJump } from "./use-group-jump";

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

/**
 * 이적시장 보드.
 *
 * 위→아래: 앱바 · 최근 3일 소식 캐러셀 · 이적시장 헤더(창 · 추적 건수 · 마감 카운트다운) ·
 * 구간 점프 탭 + 정렬(한 줄, `GroupTabs`) · 필터 레일(리그 버튼 + 관심 칩 + 구단 칩, `FilterRail`) ·
 * 구간들(긴 구간은 접혀 있다 — `BoardSections`).
 * ⚠ 이동·정렬·필터가 **각각 다른 형태**(밑줄 탭 · 텍스트 링크 · 칩)인 것이 규약이다 — 셋이 같은 칩 모양으로
 *   세 줄 쌓여 있을 때 전부 필터로 읽혔다.
 *
 * ⚠ **첫 화면만 SSR이고 필터·정렬은 서버를 부르지 않는다** — 서버는 범위 안 딜 전체를 한 번 내리고, 필터를 바꾸면
 *   주소만 바꿔(`navigateBoard`) 같은 목록으로 다시 계산한다. 서버가 새로 줄 것이 없는 이동에 서버 렌더를 기다리지 않는다.
 * ⚠ 로그인이 필요한 자리는 **관심 칩 하나**다(관심 토글은 상세에만) — 비로그인이 누르면 `SignInDialog`를 열고,
 *   로그인 뒤에는 관심 필터가 걸린 보드로 돌아온다(`next`). 다이얼로그는 스크롤 영역 밖에 한 벌 둔다.
 * ⚠ 이 슬라이스는 에메랄드·`rounded-full`·`shadow-`를 새로 쓰지 않는다 — 엔티티 컴포넌트가
 *   이미 갖는 자리(관심 표시·상태 뱃지)가 전부다.
 */
export function TransferBoardView({
  initialDeals,
  initialFollowedClubs,
  initialUserId,
  serverNowMs,
  scopeStartIso,
}: TransferBoardViewProps) {
  // 필터(`?league=`·`?sort=`·`?club=`·`?watch=`)는 **주소가 소유한다** — SSR 첫 렌더부터 화면 안 이동까지 소스가 하나다
  const { league, sort, club: requestedClub, watch } = useBoardFilters();

  // ⚠ **서버 시각이 우선이다** — `useNowMs()`는 세션당 한 번 고정되므로 클라 값을 앞에 두면
  //   낡은 시계가 갓 받은 서버 시각을 이긴다(`data-and-state.md`). `??`가 단축평가라 훅은
  //   먼저 무조건 부른다.
  const clientNowMs = useNowMs();
  const nowMs = serverNowMs ?? clientNowMs;

  // 조회·대기 판정·파생(캐러셀·구간·건수)은 `model/use-transfer-board`가 소유한다
  const { deals, rumors, groups, counts, clubFilter, watchFilter } = useTransferBoard({
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

  const { options: clubOptions, selected: club } = clubFilter;
  const { watchedCount, isGuest } = watchFilter;

  const [leagueSheetOpen, setLeagueSheetOpen] = useState(false);
  /** 비로그인이 관심 칩을 눌렀다 — 안내를 연다 */
  const [watchSignInOpen, setWatchSignInOpen] = useState(false);
  // 구간 점프·활성 칩 판정(DOM 메커니즘)은 `use-group-jump`가 소유한다
  const {
    panelRef,
    active: activeGroup,
    jump,
  } = useGroupJump(groups.map((group) => group.key));

  /** 리그는 URL이 소유한다 — `replace`라 뒤로가기 스택에 리그 변경이 쌓이지 않는다. 리그를 바꾸면 구단 필터는 푼다(다른 리그의 구단이다) */
  const handleLeagueSelect = (next: TransferLeague | null) => {
    setLeagueSheetOpen(false);
    if (next !== league) navigateBoard(boardHref(next, sort, null, watch), "replace");
  };

  const allDeals = deals.data;
  // ⚠ `nowMs`가 `null`인 것은 서버 시각 없이 마운트된 하이드레이션 전 한 프레임뿐이다(이 앱의
  //   page는 늘 내려준다). 그 프레임은 첫 창 이름을 그리고 카운트다운을 미룬다.
  const trackedWindow = trackedTransferWindow(nowMs ?? 0);
  // 카운트다운은 창이 **열려 있는 동안만** — 가장 먼저 여는 리그부터 가장 늦게 닫는 리그까지
  const openWindow = nowMs === null ? null : openTransferWindow(nowMs);

  return (
    <>
      <TabScrollArea>
        <AppBar leading={<AuthStatus />} />

        {/* ⚠ 화면 제목(h1)은 sr-only가 아니라 `BoardHeader`의 보이는 "이적시장"이다 — 다른 목록과
            달리 이 화면은 제목을 실제로 그리므로 sr-only를 더 두면 같은 글자가 두 번 읽힌다.
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
          <div
            className={cn(
              "transition-opacity duration-150 ease-otb",
              deals.isPlaceholderData && "opacity-50",
            )}
          >
            {/* 카드 0장이면 섹션 자체를 그리지 않는다 — 빈 캡션이 첫 화면 세로 공간을 먹지 않게 */}
            {rumors.length > 0 && <RumorCarousel rumors={rumors} nowMs={nowMs} />}

            <BoardHeader
              label={trackedWindow.label}
              openWindow={openWindow}
              totalCount={allDeals.length}
              serverNowMs={serverNowMs ?? null}
            />

            {/* 구간 섹션들을 담으므로 점프 훅의 ref가 여기 붙는다 */}
            <div ref={panelRef}>
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
                onWatchSignInRequired={() => setWatchSignInOpen(true)}
              />

              {groups.length === 0 ? (
                // 관심 필터가 켜져 있고 담은 딜이 하나도 없으면 "조건에 안 맞는다"가 아니라 "아직 담지 않았다"다 —
                // 어디서 담는지를 함께 말한다. 담은 딜은 있는데 리그·구단 조건에 걸러진 것이면 아래 문구다.
                watch && watchedCount === 0 ? (
                  <EmptyState
                    title="관심 목록이 비어 있어요"
                    description={
                      isGuest
                        ? "로그인하고 딜 상세에서 관심 목록에 담으면 여기에 모여요."
                        : "딜 상세에서 ‘관심 목록에 담기’를 누르면 여기에 모여요."
                    }
                  />
                ) : (
                  <EmptyState title="조건에 맞는 딜이 없어요" />
                )
              ) : (
                <BoardSections groups={groups} nowMs={nowMs} sort={sort} expanded={watch} />
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

      {/*
        관심 칩의 로그인 안내 — 프레임 직속 자리에 한 벌(`Dialog`가 `absolute`다).
        ⚠ `next`를 준다 — 누른 것이 "관심 딜만 보기"라, 로그인하고 돌아오면 그 필터가 걸려 있어야 다시 누르지 않는다.
      */}
      <SignInDialog
        open={watchSignInOpen}
        onClose={() => setWatchSignInOpen(false)}
        action="관심 딜을 모아 보려면"
        next={boardHref(league, sort, club, true)}
      />
    </>
  );
}
