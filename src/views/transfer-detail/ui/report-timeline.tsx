"use client";

import { useMemo, useState } from "react";
import { type ReportSort, type TransferReport, ReportItem, sortReports } from "@/entities/transfer";
import { cn } from "@/shared/lib";
import { Skeleton, StaleBanner } from "@/shared/ui";

interface ReportTimelineProps {
  /** `undefined`면 아직 받지 못한 것(로딩 또는 실패) — `[]`는 "받았는데 없다" */
  reports: TransferReport[] | undefined;
  /** 타임라인 조회 실패 — 본문은 그대로 두고 이 자리에서만 알린다 */
  error: Error | null;
  onRetry: () => void;
  /** 기준 시각 — `serverNowMs ?? useNowMs()`는 뷰가 한다 */
  nowMs: number | null;
}

const SORT_OPTIONS: { key: ReportSort; label: string }[] = [
  { key: "credibility", label: "공신력순" },
  { key: "latest", label: "최신순" },
];

/**
 * 보도 타임라인 패널의 내용 — 정렬(공신력순 · 최신순) + 목록. 항목 하나의 모양은 `ReportItem`(`@/entities/transfer`)이 갖는다 —
 * 보드의 오른쪽 판이 최신 보도를 같은 모양으로 그린다.
 *
 * - **가장 최근 보도**만 레일의 점이 잉크다 — 공신력순에서는 첫 항목이 최신이 아니므로 자리가 아니라 보도로 고른다
 *   (어느 정렬에서든 같은 보도가 잉크다).
 * - 정렬은 받아 온 목록에서 이 컴포넌트가 한다(`sortReports`) — 쿼리 키에 넣으면 서버 프리페치와 키가 갈린다
 *   (댓글 정렬과 같은 이유). 공신력이 같으면 최신순이다. 보도가 하나뿐이면 정렬이 아무 일도 하지 않으므로 그리지 않는다.
 *
 * ⚠ **제목 줄이 없다** — 좁은 화면에서는 탭이, 넓은 화면에서는 뷰가 단 제목이 제목과 건수를 대신한다.
 *   패널의 접근성 이름도 탭이 준다(`aria-labelledby` — 뷰가 패널을 감싼다).
 */
export function ReportTimeline({ reports, error, onRetry, nowMs }: ReportTimelineProps) {
  const [sort, setSort] = useState<ReportSort>("credibility");
  const sorted = useMemo(() => (reports ? sortReports(reports, sort) : undefined), [reports, sort]);
  // 레일의 잉크 점 — 정렬과 무관하게 가장 최근 보도 하나(서버가 최신순으로 주지만 순서에 기대지 않는다)
  const latestId = useMemo(() => (reports ? sortReports(reports, "latest")[0]?.id : undefined), [reports]);

  return (
    // ⚠ 첫 항목 위에는 선이 없다 — 탭 바의 아래 선이 그 자리를 맡는다(두 줄이 겹쳐 굵어 보인다)
    <>
      {reports === undefined && error === null && (
        // 골격은 실제 항목(1행 메타 + 요지 두 줄)과 같은 높이다
        <div aria-hidden className="py-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-2 h-[42px] w-full" />
        </div>
      )}

      {reports === undefined && error !== null && (
        <p className="py-3 text-[12px] text-ink-mute">
          보도를 불러오지 못했어요.{" "}
          <button type="button" onClick={onRetry} className="underline underline-offset-2">
            다시 시도
          </button>
        </p>
      )}

      {/* 받아 둔 타임라인은 그대로 두고 최신화 실패만 알린다(data-and-state.md) */}
      {reports !== undefined && error !== null && <StaleBanner noun="보도" onRetry={onRetry} />}

      {reports !== undefined && reports.length === 0 && (
        <p className="py-3 text-[12px] text-ink-mute">아직 연결된 보도가 없어요.</p>
      )}

      {sorted !== undefined && sorted.length > 1 && (
        // 정렬 — 댓글 탭과 같은 형태(제자리에서 다시 늘어놓는 선택 토글이라 `aria-pressed`)
        // gap 16 — 두 버튼의 히트 영역(좌우 8px씩)이 겹치지 않는 간격
        <div className="flex gap-4 pb-1 pt-4">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={sort === option.key}
              onClick={() => setSort(option.key)}
              className={cn(
                // 글자는 12px이지만 히트 영역은 투명 의사요소로 44px 이상(세로 18+28, 가로 글자+16)
                "relative text-[12px] text-ink-mute-2 transition-colors duration-150 ease-otb after:absolute after:-inset-x-2 after:-inset-y-3.5 after:content-['']",
                sort === option.key && "font-medium text-ink",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {sorted !== undefined && sorted.length > 0 && (
        <ol>
          {sorted.map((report) => (
            <ReportItem key={report.id} report={report} latest={report.id === latestId} nowMs={nowMs} />
          ))}
        </ol>
      )}
    </>
  );
}
