"use client";

import Link from "next/link";
import { useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ROUTES } from "@/shared/config";
import {
  formatCount,
  kstDateKey,
  kstDateLabel,
  serverToClientTime,
  useNowMs,
  useScrollRestore,
} from "@/shared/lib";
import { EmptyState, Icon, Skeleton, StaleBanner } from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";
import {
  DayEntry,
  TRANSFER_DAY_REPORT_LIMIT,
  type TransferDay,
  groupDayEntries,
  useTransferDayQuery,
} from "@/entities/transfer";

interface TransferDayViewProps {
  /** 주소의 날짜 키(`YYYY-MM-DD`) — 형식·미래·빈 날 판정(404)은 page가 이미 했다 */
  dateKey: string;
  /** 서버가 익명으로 받은 그 날의 소식 — 실패하면 `undefined`(클라이언트가 받는다) */
  initialDay?: TransferDay;
  /** 서버가 이 데이터를 읽은 시각 — "오늘인가"와 다음 날 링크(미래는 잇지 않는다)의 기준 */
  serverNowMs?: number;
}

/**
 * 하루(한국 시각)의 이적 소식 — 그 날 보도가 나온 딜을 보드의 구간 순서로 늘어놓고, 딜마다 그 날의 보도(한국어 요약)를 싣는다.
 *
 * 날마다 새 주소가 생기는 색인 대상 화면이다(`/transfers/daily/[date]`). 서버가 본문까지 그린다.
 * - 제목은 연도까지 붙인 절대 날짜다 — 색인에 굳어도 거짓이 되지 않는다(`reuse.md`의 `formatRelativeTime` 절).
 * - 이전 날 · 다음 날은 **소식이 있는 날**로 잇는다(`queryTransferDay`의 이웃 날) — 빈 날은 404라 그 주소를 링크하지 않는다.
 *   다음 날이 미래면 잇지 않는다.
 * ⚠ 서브헤더 화면이다(탭바가 없다).
 */
export function TransferDayView({ dateKey, initialDay, serverNowMs }: TransferDayViewProps) {
  const query = useTransferDayQuery({
    dateKey,
    initialData: initialDay,
    initialDataUpdatedAt: () => (serverNowMs === undefined ? undefined : serverToClientTime(serverNowMs)),
  });
  const day = query.data;

  // ⚠ 서버 시각이 먼저다(`data-and-state.md`) — 훅은 무조건 먼저 부른다
  const clientNowMs = useNowMs();
  const nowMs = serverNowMs ?? clientNowMs;
  const todayKey = nowMs === null ? null : kstDateKey(nowMs);
  // 키가 `YYYY-MM-DD`라 문자열 비교가 곧 날짜 비교다. 기준 시각을 모르면 다음 날을 잇지 않는다(미래일 수 있다)
  const nextKey = day?.nextKey && todayKey !== null && day.nextKey <= todayKey ? day.nextKey : null;

  const groups = useMemo(() => (day ? groupDayEntries(day.entries) : []), [day]);
  const label = kstDateLabel(dateKey);

  const scrollRef = useRef<HTMLElement>(null);
  useScrollRestore(scrollRef);

  return (
    <>
      <SubHeader title="날짜별 소식" fallbackHref={ROUTES.transferDays} />
      {/* ⚠ `relative` — `sr-only`가 프레임까지 새지 않게(`TabScrollArea` 주석). 넓은 화면은 안쪽만 가운데 열로 모은다 */}
      <main
        ref={scrollRef}
        className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(32px+env(safe-area-inset-bottom))] md:[scrollbar-gutter:stable]"
      >
        <div className="md:mx-auto md:max-w-[720px] md:pt-4">
          <header className="pt-5">
            <h1 className="text-[22px] font-semibold leading-[1.3] tracking-[-0.6px] text-ink">
              <time dateTime={dateKey}>{label}</time> 이적 소식
            </h1>
            {day && day.entries.length > 0 && (
              <p className="mt-1.5 text-[12px] text-ink-mute">
                딜 <span className="font-mono tabular-nums">{formatCount(day.entries.length)}</span>건 · 보도{" "}
                <span className="font-mono tabular-nums">{formatCount(day.reportCount)}</span>건
              </p>
            )}
          </header>

          {/* 이전 날 · 다음 날 — 소식이 있는 날만 잇는다. 없는 쪽은 자리만 남긴다(두 링크의 자리가 날마다 바뀌지 않게) */}
          <nav aria-label="다른 날" className="mt-4 flex items-center justify-between gap-3 border-y border-hairline-cool py-1">
            {day?.prevKey ? (
              <Link
                href={ROUTES.transferDay(day.prevKey)}
                prefetch={false}
                className="inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-ink"
              >
                <Icon as={ChevronLeft} size={16} />
                {kstDateLabel(day.prevKey, { weekday: false })}
              </Link>
            ) : (
              <span />
            )}
            <Link
              href={ROUTES.transferDays}
              prefetch={false}
              className="inline-flex min-h-11 items-center text-[12px] text-ink-mute underline decoration-hairline-strong underline-offset-[3px] hover:decoration-ink"
            >
              날짜 목록
            </Link>
            {nextKey ? (
              <Link
                href={ROUTES.transferDay(nextKey)}
                prefetch={false}
                className="inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-ink"
              >
                {kstDateLabel(nextKey, { weekday: false })}
                <Icon as={ChevronRight} size={16} />
              </Link>
            ) : (
              <span />
            )}
          </nav>

          {query.isPending && (
            <div aria-hidden className="mt-5 flex flex-col gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          )}

          {/* 보여줄 데이터가 없을 때만 전체 대체한다(`data-and-state.md`) */}
          {query.error && !day && (
            <EmptyState
              className="pt-8"
              title="소식을 불러오지 못했어요"
              description={query.error.message}
              onRetry={() => query.refetch()}
            />
          )}
          {query.error && day && (
            <div className="mt-4">
              <StaleBanner noun="소식" onRetry={() => query.refetch()} />
            </div>
          )}

          {day && day.entries.length === 0 && (
            <EmptyState
              className="pt-8"
              title={dateKey === todayKey ? "아직 오늘의 소식이 없어요" : "이 날은 소식이 없어요"}
              description={dateKey === todayKey ? "보도가 들어오면 여기에 모여요." : undefined}
            />
          )}

          {groups.map((group) => {
            const titleId = `day-group-${group.key}`;
            return (
              <section key={group.key} aria-labelledby={titleId} className="mt-7">
                <h2 id={titleId} className="flex items-baseline gap-1.5 section-title">
                  {group.label}
                  <span className="font-mono text-[12px] font-normal tabular-nums text-ink-mute">{group.deals.length}</span>
                </h2>
                <div className="mt-1">
                  {group.deals.map((entry) => (
                    <DayEntry key={entry.deal.id} entry={entry} />
                  ))}
                </div>
              </section>
            );
          })}

          {/* 잘림 안내 — 판정은 응답 길이(상한 + 1건)로만 한다(`buildTransferDay`) */}
          {day?.truncated && (
            <p className="pt-4 text-center text-[12px] text-ink-mute-2">
              이 날의 보도는 {formatCount(TRANSFER_DAY_REPORT_LIMIT)}건까지만 표시하고 있어요.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
