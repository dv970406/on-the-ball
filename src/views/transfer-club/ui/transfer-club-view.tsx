"use client";

import Link from "next/link";
import { useMemo, useRef } from "react";
import { ROUTES, trackedTransferWindow } from "@/shared/config";
import { cn, formatCount, useNowMs, useScrollRestore } from "@/shared/lib";
import { EmptyState, Skeleton, StaleBanner, chipClassName } from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";
import {
  DealRow,
  DealTable,
  DealTableHead,
  TRANSFER_DEAL_LIMIT,
  type TransferClub,
  type TransferDealListItem,
  TransferCrest,
} from "@/entities/transfer";
import { useClubBoard } from "../model/use-club-board";

interface TransferClubViewProps {
  /** 주소의 구단 코드 — 존재 판정(404)은 page가 이미 했다 */
  code: string;
  /** 서버가 익명으로 받은 5대 리그 구단 — 실패하면 `undefined`(클라이언트가 받는다) */
  initialClubs?: TransferClub[];
  /** 서버 프리페치(보드와 같은 목록) — 실패하면 `undefined` */
  initialDeals?: TransferDealListItem[];
  /** ⚠ 딜 목록의 쿼리 키가 userId로 스코프된다 — 서버가 본 사용자를 함께 내려야 캐시에 닿는다 */
  initialUserId?: string;
  /** 서버가 이 데이터를 읽은 시각 — 상대시각·창 이름의 첫 값 */
  serverNowMs?: number;
  /** 보드 범위 시작(ISO, 분 단위) — 딜 목록의 쿼리 키와 조회 조건 */
  scopeStartIso: string;
}

/**
 * 구단 하나의 이적시장 — 이번 창에 그 구단이 걸린 딜을 영입 · 방출 · 임대로 뛰는 선수로 가른다(`splitClubDeals`).
 *
 * 검색 착지점이다(`/transfers/club/[code]` — 닫힌 분류라 path다, `nextjs.md` 필터 절). 서버가 본문까지 그린다.
 * - 행은 보드와 같은 `DealRow`다(md+에서는 표 — `DealTable` 안에서만 그린다). 구역 제목이 h2, 선수 이름이 h3다(h1은 구단).
 * - 아래에 같은 리그의 다른 구단을 잇는다 — 구단 화면끼리의 길이자 크롤러가 구단 화면을 찾는 길이다.
 * ⚠ 서브헤더 화면이다(탭바가 없다 — 예측 랭킹과 같다). 뒤로가기가 앱 밖으로 나가는 착지(검색 결과)에서는 구단 목록으로 돌아간다.
 * ⚠ 이 화면의 행 클릭은 가로채지 않는다 — 2분할(오른쪽 판)은 보드만의 배치다. 행이 그대로 딜 상세로 간다.
 */
export function TransferClubView({
  code,
  initialClubs,
  initialDeals,
  initialUserId,
  serverNowMs,
  scopeStartIso,
}: TransferClubViewProps) {
  const { clubs, deals } = useClubBoard({ code, initialClubs, initialDeals, initialUserId, scopeStartIso, serverNowMs });
  const { club } = clubs;

  // ⚠ 서버 시각이 먼저다(`data-and-state.md`) — 훅은 무조건 먼저 부른다
  const clientNowMs = useNowMs();
  const nowMs = serverNowMs ?? clientNowMs;
  const windowLabel = nowMs === null ? null : trackedTransferWindow(nowMs).label;

  const scrollRef = useRef<HTMLElement>(null);
  useScrollRestore(scrollRef);

  const groups = deals.groups;
  const total = groups?.reduce((sum, g) => sum + g.deals.length, 0) ?? 0;
  // 보도 수 막대의 기준 — 이 화면에 보이는 딜의 최댓값(보드와 같은 뜻)
  const reportScale = useMemo(
    () => Math.max(0, ...(groups ?? []).flatMap((g) => g.deals.map((d) => d.reportCount))),
    [groups],
  );

  return (
    <>
      <SubHeader title={club?.shortName ?? "구단 이적시장"} fallbackHref={ROUTES.transferClubs} />
      {/*
        ⚠ `relative` — 행 안의 `sr-only`(position:absolute)가 프레임까지 새지 않게 한다(`TabScrollArea` 주석과 같은 사정).
        넓은 화면에서는 안쪽을 가운데 열로 모은다 — 스크롤 영역은 전체 폭으로 둬야 열 밖에서도 휠이 먹는다(`styling.md`).
      */}
      <main
        ref={scrollRef}
        className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-[calc(32px+env(safe-area-inset-bottom))] md:[scrollbar-gutter:stable]"
      >
        <div className="md:mx-auto md:max-w-[960px] md:pt-4">
          {clubs.isLoading ? (
            <div aria-hidden className="flex items-center gap-3.5 px-5 pt-5">
              <Skeleton className="size-14 shrink-0" />
              <Skeleton className="h-6 w-48" />
            </div>
          ) : club ? (
            <header className="flex items-center gap-3.5 px-5 pt-5">
              <TransferCrest club={club} size={56} priority className="shrink-0" />
              <div className="min-w-0">
                <h1 className="break-keep text-[22px] font-semibold leading-[1.25] tracking-[-0.6px] text-ink">
                  {club.name} 이적시장
                </h1>
                <p className="mt-1 text-[12px] text-ink-mute">
                  {[club.league, windowLabel && `${windowLabel} 이적 창`].filter(Boolean).join(" · ")}
                  {groups && (
                    <>
                      {" · "}
                      추적 중 <span className="font-mono tabular-nums">{formatCount(total)}</span>건
                    </>
                  )}
                </p>
              </div>
            </header>
          ) : (
            <>
              {/* 서버는 없는 구단에 404를 낸다 — 여기는 서버 조회가 실패해 클라이언트가 받은 경우뿐이다 */}
              <h1 className="sr-only">구단 이적시장</h1>
              {clubs.error ? (
                <EmptyState
                  className="pt-10"
                  title="구단을 불러오지 못했어요"
                  description={clubs.error.message}
                  onRetry={() => clubs.refetch()}
                />
              ) : (
                <EmptyState className="pt-10" title="구단을 찾을 수 없어요" />
              )}
            </>
          )}

          {club && (
            <>
              {deals.isLoading && (
                <div aria-hidden className="mt-6 flex flex-col gap-2 px-5">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              )}

              {/* 보여줄 데이터가 없을 때만 전체 대체한다(`data-and-state.md`) */}
              {deals.error && !deals.hasData && (
                <EmptyState
                  className="pt-8"
                  title="딜을 불러오지 못했어요"
                  description={deals.error.message}
                  onRetry={() => deals.refetch()}
                />
              )}
              {deals.error && deals.hasData && (
                <div className="mt-4 px-5">
                  <StaleBanner noun="딜" onRetry={() => deals.refetch()} />
                </div>
              )}

              {groups && groups.length === 0 && (
                <EmptyState
                  className="pt-8"
                  title={`이번 창에 ${club.shortName} 소식이 없어요`}
                  description="이적 보도가 쌓이면 영입·방출 소식이 여기에 모여요."
                />
              )}

              {groups && groups.length > 0 && (
                // 계정이 바뀌는 동안(placeholderData) 이전 목록이 남아 있다는 걸 은은하게 알린다(보드와 같다)
                <DealTable
                  className={cn(
                    "mt-5 transition-opacity duration-150 ease-otb",
                    deals.isPlaceholderData && "opacity-50",
                  )}
                >
                  <DealTableHead sort="latest" />
                  {groups.map((group, i) => {
                    const titleId = `club-side-${group.side}`;
                    return (
                      <section key={group.side} aria-labelledby={titleId}>
                        {/* 보드의 구간 제목과 같은 모양 — md+에서는 표 안의 구간 머리 행이다 */}
                        <h2
                          id={titleId}
                          className={cn(
                            "flex items-baseline gap-1.5 px-5 pb-1.5 text-[15px] font-medium tracking-[-0.3px] text-ink",
                            i === 0 ? "pt-3.5" : "pt-7",
                            "md:border-b md:border-hairline-cool md:bg-canvas-soft md:py-2 md:text-[13px]",
                            i > 0 && "md:border-t",
                          )}
                        >
                          {group.label}
                          <span className="font-mono text-[12px] tabular-nums text-ink-mute">{group.deals.length}</span>
                        </h2>
                        <ul>
                          {group.deals.map((deal) => (
                            <DealRow key={deal.id} deal={deal} nowMs={nowMs} reportScale={reportScale} />
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </DealTable>
              )}

              {/*
                잘림 안내 — 이 화면은 보드 목록(상한 `TRANSFER_DEAL_LIMIT`)에서 고른다. 상한에 닿으면 이 구단의 오래된 딜이 빠졌을 수
                있다 — 조용히 자르지 않는다(`reuse.md`)
              */}
              {deals.truncated && (
                <p className="px-5 pt-4 text-center text-[12px] text-ink-mute-2">
                  이번 창의 최근 딜 {formatCount(TRANSFER_DEAL_LIMIT)}건 안에서 모았어요. 오래된 딜은 빠졌을 수 있어요.
                </p>
              )}

              {/*
                둘러보기 — 보드에서 이 구단만 걸러 보기(2분할 판이 있는 화면) · 같은 리그의 다른 구단 · 구단 전체.
                ⚠ 보드 필터는 주소의 `?club=`이다(색인 대상이 아닌 query — canonical은 `/transfers`). 링크가 만드는 값이 보드의
                  해석(`parseTransferClub`)과 같아야 한다 — 구단 코드를 그대로 싣는다.
              */}
              <nav aria-label="다른 구단 둘러보기" className="mt-8 px-5">
                <Link
                  href={{ pathname: ROUTES.transferList, query: { club: code } }}
                  prefetch={false}
                  className="inline-flex min-h-11 items-center text-[13px] font-medium text-ink underline decoration-hairline-strong underline-offset-[3px] hover:decoration-ink"
                >
                  이적시장 보드에서 {club.shortName}만 보기
                </Link>
                {clubs.leagueClubs.length > 0 && (
                  <section aria-labelledby="club-league-heading" className="mt-6">
                    <h2 id="club-league-heading" className="section-title">
                      {club.league}의 다른 구단
                    </h2>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {clubs.leagueClubs.map((other) => (
                        <li key={other.code}>
                          <Link
                            href={ROUTES.transferClub(other.code)}
                            prefetch={false}
                            className={chipClassName(false, "inline-flex items-center gap-1.5 text-ink-secondary")}
                          >
                            <TransferCrest club={other} size={16} className="shrink-0" />
                            {other.shortName}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <Link
                  href={ROUTES.transferClubs}
                  prefetch={false}
                  className="mt-4 inline-flex min-h-11 items-center text-[13px] font-medium text-ink-mute underline decoration-hairline-strong underline-offset-[3px] hover:decoration-ink"
                >
                  5대 리그 구단 전체 보기
                </Link>
              </nav>
            </>
          )}
        </div>
      </main>
    </>
  );
}
