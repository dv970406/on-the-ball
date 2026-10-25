"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { formatCount, kstDateLabel, serverToClientTime } from "@/shared/lib";
import { EmptyState, Icon, Skeleton, StaleBanner } from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";
import { type TransferDaySummary, useTransferDayListQuery } from "@/entities/transfer";

interface TransferDayListViewProps {
  /** 목록의 시작 날 — 쿼리 키라 서버가 정한 값을 그대로 쓴다(`daySummaryStartKey`) */
  startKey: string;
  /** 서버가 익명으로 받은 날짜 목록 — 실패하면 `undefined`(클라이언트가 받는다) */
  initialDays?: TransferDaySummary[];
  /** 서버가 이 목록을 읽은 시각 — 신선도의 기준 */
  serverNowMs?: number;
}

/**
 * 날짜별 이적 소식의 입구 — 최근 날 중 소식이 있는 날을 최신순으로 늘어놓고 그 날의 화면(`/transfers/daily/[date]`)으로 잇는다.
 *
 * 크롤러가 날짜 화면을 찾는 허브이기도 하다. 날마다 딜·보도 수를 함께 적는다(어느 날에 소식이 몰렸는지).
 * ⚠ 소식이 없는 날은 싣지 않는다 — 그 주소는 404다(`app/transfers/daily/[date]/page.tsx`).
 */
export function TransferDayListView({ startKey, initialDays, serverNowMs }: TransferDayListViewProps) {
  const days = useTransferDayListQuery({
    startKey,
    initialData: initialDays,
    initialDataUpdatedAt: () => (serverNowMs === undefined ? undefined : serverToClientTime(serverNowMs)),
  });

  return (
    <>
      <SubHeader title="날짜별 소식" fallbackHref={ROUTES.transferList} />
      {/* ⚠ `relative` — `sr-only`가 프레임까지 새지 않게(`TabScrollArea` 주석). 넓은 화면은 안쪽만 가운데 열로 모은다 */}
      <main className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(32px+env(safe-area-inset-bottom))] md:[scrollbar-gutter:stable]">
        <div className="md:mx-auto md:max-w-[720px] md:pt-4">
          <header className="pt-5">
            <h1 className="text-[22px] font-semibold tracking-[-0.6px] text-ink">날짜별 이적 소식</h1>
            <p className="mt-1.5 break-keep text-[13px] leading-[1.6] text-ink-mute">
              하루 동안 나온 이적 보도를 딜마다 모아 봅니다. 최근 날부터 소식이 있는 날만 보여요.
            </p>
          </header>

          {days.isPending && (
            <div aria-hidden className="mt-5 flex flex-col gap-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}

          {/* 보여줄 데이터가 없을 때만 전체 대체한다(`data-and-state.md`) */}
          {days.error && !days.data && (
            <EmptyState
              className="pt-8"
              title="날짜 목록을 불러오지 못했어요"
              description={days.error.message}
              onRetry={() => days.refetch()}
            />
          )}
          {days.error && days.data && (
            <div className="mt-4">
              <StaleBanner noun="날짜 목록" onRetry={() => days.refetch()} />
            </div>
          )}

          {days.data && days.data.length === 0 && (
            <EmptyState className="pt-8" title="최근 소식이 없어요" description="이적 보도가 들어오면 날마다 여기에 모여요." />
          )}

          {days.data && days.data.length > 0 && (
            <ol className="mt-4">
              {days.data.map((day) => (
                <li key={day.dateKey} className="border-t border-hairline-cool first:border-t-0">
                  <Link
                    href={ROUTES.transferDay(day.dateKey)}
                    prefetch={false}
                    className="flex min-h-14 items-center gap-3 py-3 transition-colors duration-150 ease-otb active:bg-canvas-soft"
                  >
                    <time dateTime={day.dateKey} className="text-[15px] font-medium tracking-[-0.3px] text-ink">
                      {kstDateLabel(day.dateKey)}
                    </time>
                    <span className="ml-auto font-mono text-[12px] tabular-nums text-ink-mute">
                      딜 {formatCount(day.dealCount)} · 보도 {formatCount(day.reportCount)}
                    </span>
                    <Icon as={ChevronRight} size={16} className="text-ink-mute-2" />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
      </main>
    </>
  );
}
