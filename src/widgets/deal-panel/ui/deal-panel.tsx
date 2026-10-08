"use client";

import { useId, useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  ContractTerms,
  DealInfoLine,
  DealRouteCard,
  FeeHighlight,
  ReportFlowChart,
  ReportItem,
  StatusBadge,
  SuitorList,
  type TransferDealListItem,
  playerName,
  sortReports,
  useTransferReportsQuery,
} from "@/entities/transfer";
import { useDealPredictionQuery } from "@/entities/prediction";
import { PredictionCard } from "@/features/predict-deal";
import { PushNudge, usePushNudge } from "@/features/push-notification";
import { WatchToggle } from "@/features/watch-transfer";
import { ROUTES } from "@/shared/config";
import { cn, formatCount, formatRelativeTime } from "@/shared/lib";
import { Icon, Skeleton, StaleBanner, buttonClassName } from "@/shared/ui";
import { useDwell } from "./use-dwell";

export interface DealPanelProps {
  /** 보드 목록 캐시의 딜 — 관심 토글의 낙관적 갱신이 이 캐시를 고치므로 누르는 즉시 이 판이 따라온다 */
  deal: TransferDealListItem;
  /** 뷰가 정한 쿼리 스코프(세션 복원 전에는 서버가 본 사용자) — 예측 조회·관심 토글이 이 키를 쓴다 */
  userId: string | undefined;
  /** 기준 시각 — `serverNowMs ?? useNowMs()`는 뷰가 계산해 넘긴다 */
  nowMs: number | null;
  /**
   * 판이 실제로 보이는가(넓은 화면의 2분할) — 보드는 판을 **늘 렌더**하고(SSR 포함) 좁은 화면에서는 CSS로 숨긴다.
   * 거짓이면 판은 조회를 하나도 열지 않는다.
   */
  active: boolean;
  /** 비로그인이 누른 동작(`~하려면`) — 뷰가 `SignInDialog` 한 벌을 연다 */
  onSignInRequired: (action: string) => void;
}

/** 최신 보도 몇 건을 보여 주는가 — 나머지는 "전체 보기"(딜 상세)가 갖는다 */
const LATEST_REPORTS = 3;

/**
 * 조회를 열기 전에 한 딜에 머무는 시간 — J/K로 목록을 훑는 동안 지나가는 딜마다 조회(보도·예측)를 열지 않게 한다.
 * 사람이 판을 읽기 시작하는 시간보다 짧다(그 사이 Skeleton이 자리를 잡는다).
 */
const DWELL_MS = 150;

/** 구역 제목 — 판 안의 h3(판 제목이 h2다) */
const sectionTitle = "text-[15px] font-semibold tracking-[-0.3px] text-ink";

/**
 * 딜 패널 — 넓은 화면의 이적 보드에서 고른 딜을 오른쪽에 펼치는 판. 부모 높이를 채우고 본문은 스스로 스크롤하며,
 * 아래에 "전체 화면" 링크와 관심 토글을 고정한다.
 *
 * - **보드가 판을 늘 렌더한다(SSR 포함)** — 넓은 화면의 첫 페인트에 판 제목이 곧바로 그려지게(LCP). 그래서 판의 머리
 *   (뱃지·이름·정보줄·경로·이적료·계약·관심 구단)는 **목록 데이터만으로** 그리고, 렌더 중에 창 폭·미디어 쿼리·시계를 읽지 않는다
 *   (서버 HTML과 첫 클라이언트 렌더가 같다 — 시각은 `nowMs` prop뿐이다).
 * - 판 안의 조회(보도 타임라인·성사 예측)는 서버 프리페치 없는 클라이언트 조회이고, **`active`가 참인 채로 같은 딜에
 *   `DWELL_MS` 머문 뒤에만** 연다(`useDwell`). 좁은 화면(판이 숨겨진 자리)에서는 하나도 나가지 않고, 목록을 키보드로 훑을 때
 *   지나간 딜마다 조회가 쌓이지 않는다. 열리기 전과 도착 전에는 Skeleton이고, 이미 받아 둔 캐시가 있으면 기다리지 않고 그린다
 *   (`enabled`가 꺼져 있어도 캐시는 읽힌다). 실패는 그 자리에서만 알린다(본문은 목록 캐시의 딜이라 늘 있다).
 * - 딜 본문은 **목록 캐시의 값**(`deal` prop)으로 그린다 — 관심 토글의 낙관적 갱신이 목록·상세 캐시를 함께 고치므로 다시 받을
 *   필요가 없다. 목록 select에 없는 것은 없다(상세 단건과 같은 컬럼 + 최신 보도 1건).
 * - 에메랄드는 하단의 관심 토글 하나다(`WatchToggle`) — "전체 화면"은 `secondary`, 예측 카드는 잉크다.
 * - 관심을 **방금** 담았으면 알림 안내를 한 줄 낸다(`usePushNudge` — 딜 상세와 같은 판정). 판이 다른 딜로 바뀌면 걷힌다.
 * - 판 본문의 스크롤바를 숨기지 않는다(보드의 판·레일과 같은 판단 — 넓은 화면에서는 스크롤할 수 있다는 표시가 막대뿐이다).
 * ⚠ 상세로 가는 두 링크("전체 보기"·"전체 화면")는 프리페치를 끈다(`prefetch={false}` — 사유는 `DealRow`와 같다: loading 경계가
 *   없는 동적 상세라 뷰포트 프리페치가 빈 라우터 트리만 받아 온다). 켜 두면 판이 딜마다 새로 마운트되어 고를 때마다 두 건씩 나간다.
 * ⚠ 로그인 안내를 여기서 그리지 않는다 — `Dialog`가 `absolute`라 이 판 안에 두면 판 기준으로 뜬다. 뷰가 한 벌 갖는다.
 * ⚠ 단계 흐름선·보도 이적료 추이·관심 구단 비중(%)은 그리지 않는다 — 공개 데이터가 뱃지와 다른 판정이거나(보도별 단계·금액)
 *   그 수치가 저장돼 있지 않다(관심 구단은 순서뿐). 직전 보도도 금액만이다(그 보도의 시각은 딜에 없다).
 */
export function DealPanel({ deal, userId, nowMs, active, onSignInRequired }: DealPanelProps) {
  const titleId = useId();
  // 보드가 딜마다 판을 재마운트(`key`)하므로 머문 시간도 딜마다 처음부터 잰다
  const dwelt = useDwell(active, DWELL_MS);
  const enabled = active && dwelt;
  const reports = useTransferReportsQuery({ dealId: deal.id, enabled });
  const prediction = useDealPredictionQuery({ dealId: deal.id, userId, enabled });
  const nudge = usePushNudge({ dealId: deal.id, watched: deal.isWatched, userId });
  const latest = useMemo(
    () => (reports.data ? sortReports(reports.data, "latest").slice(0, LATEST_REPORTS) : undefined),
    [reports.data],
  );

  return (
    <section aria-labelledby={titleId} className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-5">
        <header>
          <div className="flex items-center gap-2">
            <StatusBadge stage={deal.stage} />
            {/* nowrap + flex-none — 뱃지가 길어져도 시각이 줄 바꿈되지 않는다 */}
            <span className="ml-auto flex-none whitespace-nowrap text-[11px] text-ink-mute-2">
              업데이트{" "}
              <time dateTime={deal.latestReportedAt} className="font-mono tabular-nums">
                {formatRelativeTime(deal.latestReportedAt, nowMs)}
              </time>
              {" · "}보도 <span className="font-mono tabular-nums">{formatCount(deal.reportCount)}</span>건
            </span>
          </div>
          <h2
            id={titleId}
            className="mt-3 text-pretty text-[26px] font-semibold leading-[1.2] tracking-[-0.8px] text-ink"
          >
            {playerName(deal)}
          </h2>
          <DealInfoLine deal={deal} />
        </header>

        <DealRouteCard deal={deal} className="mt-4" />

        <div className="mt-5 rounded-lg border border-hairline p-4">
          <FeeHighlight deal={deal} />
          <ContractTerms deal={deal} className="mt-3 border-t border-hairline-cool" />
        </div>

        <ReportFlowChart
          className="mt-7"
          title={<h3 className={sectionTitle}>보도 흐름</h3>}
          reports={reports.data}
          error={reports.error}
          onRetry={() => reports.refetch()}
          nowMs={nowMs}
        />

        <section className="mt-7">
          <div className="flex items-baseline justify-between">
            <h3 className={sectionTitle}>관심 구단</h3>
            <span className="text-[11px] text-ink-mute-2">유력한 순</span>
          </div>
          <SuitorList deal={deal} className="mt-1.5" />
        </section>

        {/* 성사 예측 — 결과가 나오면(합의 완료·오피셜) 닫힌다. 다음 창 일정이 없으면 카드가 그려지지 않는다 */}
        <PredictionCard
          className="mt-6"
          headingLevel="h3"
          dealId={deal.id}
          settled={deal.stage === "here_we_go" || deal.stage === "official"}
          prediction={prediction.data}
          error={prediction.error}
          onRetry={() => prediction.refetch()}
          userId={userId}
          nowMs={nowMs}
          onSignInRequired={onSignInRequired}
        />

        <section className="mt-7">
          <div className="flex items-baseline justify-between">
            <h3 className={sectionTitle}>최신 보도</h3>
            <Link
              href={ROUTES.transfer(deal.id)}
              prefetch={false}
              className="relative text-[12px] font-medium text-ink-mute after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] hover:text-ink"
            >
              전체 보기<span className="sr-only"> — 보도 {formatCount(deal.reportCount)}건</span>
            </Link>
          </div>
          {latest === undefined && reports.error === null && (
            <div aria-hidden className="mt-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-[42px] w-full" />
            </div>
          )}
          {/* 받아 둔 보도는 그대로 두고 최신화 실패만 알린다 — 받지 못한 실패는 위 보도 흐름이 이미 알렸다 */}
          {latest !== undefined && reports.error !== null && (
            <div className="mt-2">
              <StaleBanner noun="보도" onRetry={() => reports.refetch()} />
            </div>
          )}
          {latest !== undefined && latest.length > 0 && (
            <ol className="mt-1">
              {latest.map((report, i) => (
                <ReportItem key={report.id} report={report} latest={i === 0} nowMs={nowMs} />
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* 하단 고정 줄 — 판의 유일한 에메랄드 CTA는 관심 토글이다(활성 시 `primary` — `buttonClassName`이 갖는다) */}
      <footer className="border-t border-hairline-cool bg-canvas px-6 py-3">
        {nudge.show && <PushNudge />}
        <div className="flex gap-2">
          <Link
            href={ROUTES.transfer(deal.id)}
            prefetch={false}
            className={cn(buttonClassName({ variant: "secondary" }), "shrink-0")}
          >
            전체 화면
            <Icon as={ArrowUpRight} size={16} />
          </Link>
          <div className="min-w-0 flex-1">
            <WatchToggle
              dealId={deal.id}
              watched={deal.isWatched}
              onSignInRequired={() => onSignInRequired("관심 목록에 담으려면")}
              onWatched={nudge.onWatched}
            />
          </div>
        </div>
      </footer>
    </section>
  );
}
