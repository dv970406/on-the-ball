// ⚠ `"use client"`가 없다 — 상호작용이 없는 렌더러라 서버 렌더 여지를 남긴다(`architecture.md`).
import { cn } from "@/shared/lib/cn";
import { formatCount, formatRelativeTime } from "@/shared/lib/format";
import type { TransferDeal } from "../model/types";
import { DealFormMark } from "./deal-form-mark";
import { StatusBadge } from "./status-badge";

interface DealStatusLineProps {
  deal: Pick<TransferDeal, "stage" | "form" | "loanClause" | "latestReportedAt" | "reportCount">;
  /** 기준 시각 — `serverNowMs ?? useNowMs()`는 호출부가 한다 */
  nowMs: number | null;
  /** 업데이트 칸의 자리 — 기본은 줄 오른쪽 끝이다 */
  updateClassName?: string;
  /** 보도 수의 노출 — 좁은 화면은 타임라인 탭이 건수를 갖는 자리에서 가린다 */
  countClassName?: string;
}

/**
 * 딜 머리의 첫 줄 — 상태 뱃지 · 형태 표지 · 업데이트 시각 · 보도 수. 딜 상세와 보드의 오른쪽 판이 함께 그린다.
 * 형태 표지(임대)는 진전과 다른 축이라 뱃지 옆에 따로 서고, 완전 이적·모름은 그리지 않는다.
 * ⚠ 숫자·시각만 mono다 — 글자까지 mono로 두면 같은 줄이 자리마다 다르게 보인다.
 */
export function DealStatusLine({ deal, nowMs, updateClassName, countClassName }: DealStatusLineProps) {
  return (
    <div className="flex items-center gap-2">
      <StatusBadge stage={deal.stage} />
      <DealFormMark deal={deal} />
      {/* nowrap + flex-none — 뱃지가 길어져도 시각이 줄 바꿈되지 않는다 */}
      <span className={cn("ml-auto flex-none whitespace-nowrap text-[11px] text-ink-mute-2", updateClassName)}>
        업데이트{" "}
        <time dateTime={deal.latestReportedAt} className="font-mono tabular-nums">
          {formatRelativeTime(deal.latestReportedAt, nowMs)}
        </time>
        <span className={countClassName}>
          {" · "}보도 <span className="font-mono tabular-nums">{formatCount(deal.reportCount)}</span>건
        </span>
      </span>
    </div>
  );
}
