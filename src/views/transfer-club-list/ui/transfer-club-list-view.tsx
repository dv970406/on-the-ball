"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ROUTES } from "@/shared/config";
import { serverToClientTime } from "@/shared/lib";
import { EmptyState, Skeleton, StaleBanner } from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";
import { TRANSFER_LEAGUES, type TransferClub, TransferCrest, useTransferClubListQuery } from "@/entities/transfer";

interface TransferClubListViewProps {
  /** 서버가 익명으로 받은 5대 리그 구단 — 실패하면 `undefined`(클라이언트가 받는다) */
  initialClubs?: TransferClub[];
  /** 서버가 이 목록을 읽은 시각 — 신선도의 기준 */
  serverNowMs?: number;
}

/**
 * 구단별 이적시장의 입구 — 5대 리그 구단을 리그별로 늘어놓고 구단 화면(`/transfers/club/[code]`)으로 잇는다.
 *
 * 크롤러가 구단 화면을 찾는 허브이기도 하다(사이트맵 밖의 발견 경로). 구단 표는 "나"와 무관해 서버가 익명으로 받는다.
 * ⚠ 리그 순서는 `TRANSFER_LEAGUES`(리그 시트와 같은 순서), 리그 안은 정식명순(`compareClubs` — 조회가 이미 그 순서다).
 */
export function TransferClubListView({ initialClubs, serverNowMs }: TransferClubListViewProps) {
  const clubs = useTransferClubListQuery({
    initialData: initialClubs,
    initialDataUpdatedAt: () => (serverNowMs === undefined ? undefined : serverToClientTime(serverNowMs)),
  });
  const leagues = useMemo(
    () =>
      TRANSFER_LEAGUES.map((league) => ({
        league,
        clubs: (clubs.data ?? []).filter((c) => c.league === league),
      })).filter((group) => group.clubs.length > 0),
    [clubs.data],
  );

  return (
    <>
      <SubHeader title="구단별 이적시장" fallbackHref={ROUTES.transferList} />
      {/* ⚠ `relative` — `sr-only`가 프레임까지 새지 않게(`TabScrollArea` 주석). 넓은 화면은 안쪽만 가운데 열로 모은다 */}
      <main className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(32px+env(safe-area-inset-bottom))] md:[scrollbar-gutter:stable]">
        <div className="md:mx-auto md:max-w-[960px] md:pt-4">
          <header className="pt-5">
            <h1 className="text-[22px] font-semibold tracking-[-0.6px] text-ink">구단별 이적시장</h1>
            <p className="mt-1.5 break-keep text-[13px] leading-[1.6] text-ink-mute">
              유럽 5대 리그 구단을 고르면 그 구단의 영입·방출 소식을 단계별로 모아 봅니다.
            </p>
          </header>

          {clubs.isPending && (
            <div aria-hidden className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
              {Array.from({ length: 12 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}

          {/* 보여줄 데이터가 없을 때만 전체 대체한다(`data-and-state.md`) */}
          {clubs.error && !clubs.data && (
            <EmptyState
              className="pt-8"
              title="구단을 불러오지 못했어요"
              description={clubs.error.message}
              onRetry={() => clubs.refetch()}
            />
          )}
          {clubs.error && clubs.data && (
            <div className="mt-4">
              <StaleBanner noun="구단" onRetry={() => clubs.refetch()} />
            </div>
          )}

          {clubs.data && leagues.length === 0 && <EmptyState className="pt-8" title="아직 구단이 없어요" />}

          {leagues.map(({ league, clubs: leagueClubs }) => {
            const titleId = `club-league-${TRANSFER_LEAGUES.indexOf(league)}`;
            return (
              <section key={league} aria-labelledby={titleId} className="mt-7">
                <h2 id={titleId} className="section-title">
                  {league}
                </h2>
                <ul className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                  {leagueClubs.map((club) => (
                    <li key={club.code}>
                      <Link
                        href={ROUTES.transferClub(club.code)}
                        prefetch={false}
                        className="flex min-h-12 items-center gap-2.5 rounded-md border border-hairline px-3 py-2 text-[14px] font-medium text-ink transition-colors duration-150 ease-otb hover:bg-canvas-soft active:bg-canvas-soft"
                      >
                        <TransferCrest club={club} size={24} className="shrink-0" />
                        {/* 정식명은 자르지 않고 낱말 단위로 줄을 바꾼다 — 잘린 구단 이름은 어느 구단인지 알 수 없다. 한 낱말이 칸보다
                            길 때만 그 안에서 꺾는다(`styling.md` 좁은 칸 이름 절) */}
                        <span className="min-w-0 break-keep leading-[1.3] [overflow-wrap:anywhere]">{club.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}
