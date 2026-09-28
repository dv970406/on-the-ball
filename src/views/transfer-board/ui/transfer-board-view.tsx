"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  TRANSFER_DEAL_LIMIT,
  type TransferDealListItem,
  type TransferLeague,
  type TransferSort,
} from "@/entities/transfer";
import { openTransferWindow, trackedTransferWindow } from "@/shared/config";
import { cn, formatCount, useNowMs } from "@/shared/lib";
import { EmptyState, StaleBanner } from "@/shared/ui";
import { AppBar } from "@/widgets/app-bar";
import { AuthStatus } from "@/widgets/auth-status";
import { BottomTabBar } from "@/widgets/bottom-tab-bar";
import { TabScrollArea } from "@/widgets/tab-scroll-area";
import { boardHref } from "../lib/board-href";
import { useTransferBoard } from "../model/use-transfer-board";
import { BoardHeader } from "./board-header";
import { BoardSections } from "./board-sections";
import { BoardTools } from "./board-tools";
import { ClubChips } from "./club-chips";
import { GroupChips } from "./group-chips";
import { LeagueSheet } from "./league-sheet";
import { RumorCarousel } from "./rumor-carousel";
import { TransferBoardSkeleton } from "./transfer-board-skeleton";
import { useGroupJump } from "./use-group-jump";

interface TransferBoardViewProps {
  /** 서버 프리페치 결과 — 실패하면 undefined가 오고 클라이언트가 조회한다 */
  initialDeals?: TransferDealListItem[];
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
  /** `null` = 전체 리그. **URL이 소유한다** — 로컬 state가 아니다 */
  league: TransferLeague | null;
  sort: TransferSort;
  /** `null` = 전체 구단. 구단 코드(`?club=`) — 보드에 없는 구단은 모델이 전체로 폴백한다 */
  club: string | null;
}

/**
 * 이적시장 보드(handoff 4장 · 계획서 §3-6).
 *
 * 위→아래: 앱바 · 최근 3일 소식 캐러셀 · 이적시장 헤더(창 · 추적 건수 · 마감 카운트다운) ·
 * 구간 점프 칩 · 도구줄 · 구단 필터 칩 · 구간들(긴 구간은 접혀 있다 — `BoardSections`).
 *
 * ⚠ `SignInDialog`를 두지 않는다 — 보드에는 로그인이 필요한 액션이 없다(관심 토글은 상세에만).
 * ⚠ 이 슬라이스는 에메랄드·`rounded-full`·`shadow-`를 새로 쓰지 않는다 — 엔티티 컴포넌트가
 *   이미 갖는 자리(관심 표시·상태 뱃지)가 전부다.
 */
export function TransferBoardView({
  initialDeals,
  initialUserId,
  serverNowMs,
  scopeStartIso,
  league,
  sort,
  club: requestedClub,
}: TransferBoardViewProps) {
  const router = useRouter();

  // ⚠ **서버 시각이 우선이다** — `useNowMs()`는 세션당 한 번 고정되므로 클라 값을 앞에 두면
  //   낡은 시계가 갓 받은 서버 시각을 이긴다(`data-and-state.md`). `??`가 단축평가라 훅은
  //   먼저 무조건 부른다.
  const clientNowMs = useNowMs();
  const nowMs = serverNowMs ?? clientNowMs;

  // 조회·대기 판정·파생(캐러셀·구간·건수)은 `model/use-transfer-board`가 소유한다
  const { deals, rumors, groups, counts, clubOptions, club } = useTransferBoard({
    initialDeals,
    initialUserId,
    scopeStartIso,
    league,
    sort,
    club: requestedClub,
    nowMs,
  });

  const [leagueSheetOpen, setLeagueSheetOpen] = useState(false);
  // 구간 점프·활성 칩 판정(DOM 메커니즘)은 `use-group-jump`가 소유한다
  const {
    panelRef,
    active: activeGroup,
    jump,
  } = useGroupJump(groups.map((group) => group.key));

  /** 리그는 URL이 소유한다 — `replace`라 뒤로가기 스택에 리그 변경이 쌓이지 않는다. 리그를 바꾸면 구단 필터는 푼다(다른 리그의 구단이다) */
  const handleLeagueSelect = (next: TransferLeague | null) => {
    setLeagueSheetOpen(false);
    if (next !== league) router.replace(boardHref(next, sort, null), { scroll: false });
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
            달리 이 화면은 제목을 실제로 그리므로 sr-only를 더 두면 같은 글자가 두 번 읽힌다. */}

        {deals.isLoading && <TransferBoardSkeleton />}

        {/*
          ⚠ 에러 화면은 **보여줄 데이터가 없을 때만** 띄운다. 리페치가 실패해도 data는 유지되므로,
            조건을 나누지 않으면 에러 박스와 정상 보드가 한 화면에 공존한다.
        */}
        {deals.error && !allDeals && (
          <EmptyState
            title="이적 소식을 불러오지 못했어요"
            description={deals.error.message}
            onRetry={() => deals.refetch()}
          />
        )}

        {/* 캐시된 보드는 그대로 두고 최신화 실패만 알린다 */}
        {deals.error && allDeals && <StaleBanner noun="이적 소식" onRetry={() => deals.refetch()} />}

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
              <GroupChips counts={counts} active={activeGroup} onJump={jump} />
              <BoardTools league={league} sort={sort} club={club} onOpenLeague={() => setLeagueSheetOpen(true)} />
              <ClubChips options={clubOptions} club={club} league={league} sort={sort} />

              {groups.length === 0 ? (
                <EmptyState title="조건에 맞는 이적 건이 없어요" />
              ) : (
                <BoardSections groups={groups} nowMs={nowMs} sort={sort} />
              )}

              {/*
                잘림 안내 — 판정은 **응답 길이만으로** 한다(서버 카운트와 비교하면 리페치 시점이
                달라 잘못된 안내가 뜬다). 리그 필터 전 전체 수가 기준이다 — 잘린 것은 응답이다.
              */}
              {allDeals.length >= TRANSFER_DEAL_LIMIT && (
                <p className="px-5 pb-1 pt-4 text-center text-[12px] text-ink-mute-2">
                  이적 건은 {formatCount(TRANSFER_DEAL_LIMIT)}건까지만 표시하고 있어요.
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
    </>
  );
}
