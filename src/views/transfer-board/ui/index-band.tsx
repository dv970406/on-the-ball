"use client";

import type { TransferWindow } from "@/shared/config";
import { memo, useMemo } from "react";
import {
  GROUP_LABEL,
  STAGE_STATUS,
  STATUS_LABEL,
  type TransferDealListItem,
  type TransferStatus,
} from "@/entities/transfer";
import { formatCount } from "@/shared/lib";
import { DeadlineCountdown } from "./deadline-countdown";

/**
 * 띠의 칸 — 보드 구간에서 진행 중을 뱃지 톤(합의 임박·협상 중)으로 가르고, 결렬·부인은 보드 구간처럼 한 칸이다.
 * 라벨은 뱃지·구간 제목과 같은 맵에서 온다(손으로 다시 적지 않는다).
 */
const CELLS: readonly { key: string; label: string; tones: readonly TransferStatus[] }[] = [
  { key: "official", label: STATUS_LABEL.official, tones: ["official"] },
  { key: "hwg", label: STATUS_LABEL.hwg, tones: ["hwg"] },
  { key: "imminent", label: STATUS_LABEL.imminent, tones: ["imminent"] },
  { key: "talks", label: STATUS_LABEL.talks, tones: ["talks"] },
  { key: "rumor", label: STATUS_LABEL.rumor, tones: ["rumor"] },
  { key: "dead", label: GROUP_LABEL.dead, tones: ["dead", "denied"] },
];

interface IndexBandProps {
  /** 보드 전체(필터 무관) — 띠는 "지금 시장에 무엇이 있는가"라 필터를 타지 않는다 */
  deals: readonly TransferDealListItem[];
  /** 보드가 추적하는 창의 이름(`trackedTransferWindow(nowMs).label`) */
  windowLabel: string;
  /** 지금 열려 있는 창 — 없으면 카운트다운을 그리지 않는다 */
  openWindow: TransferWindow | null;
  serverNowMs: number | null;
}

/**
 * lg+ 지수 띠 — 구간별 건수 칸 + 오른쪽에 창 이름 · 추적 건수 · 마감 카운트다운. 모바일·md의 `BoardHeader`가 갖던 정보를
 * 넓은 화면의 머리로 옮긴 것이다(그 폭에서 `BoardHeader`는 제목만 sr-only로 남긴다).
 *
 * ⚠ **지금 데이터로 말할 수 있는 것만 그린다** — 칸마다의 "오늘 증감", 이번 창 오피셜 이적료 합계·추이는 비운다
 *   (하루 전 상태를 저장하지 않는다). 그 값을 만들 원천이 생기면 그때 칸을 더한다.
 * ⚠ 칸 앞 색 점을 두지 않는다 — 상태의 색은 뱃지가 진다(에메랄드·`rounded-full` 자리를 늘리지 않는다).
 * ⚠ 건수는 `<dl>`이다(라벨 → 값).
 * ⚠ 마감 카운트다운은 `BoardHeader`(lg 미만)와 이 띠(lg+)에 한 벌씩 있고 한쪽은 CSS로 가려진다 — 폭으로 갈라 하나만 그리면
 *   서버 HTML이 한 폭의 것이 되어 다른 폭의 첫 화면이 하이드레이션 뒤에 바뀐다. 1초 시계는 둘이 하나를 나눠 쓴다(`useDeadline`).
 */
export const IndexBand = memo(function IndexBand({ deals, windowLabel, openWindow, serverNowMs }: IndexBandProps) {
  // 행을 고를 때마다 뷰가 다시 그려진다 — 건수는 보드가 바뀔 때만 센다
  const cellCounts = useMemo(() => {
    const counts = new Map<TransferStatus, number>();
    for (const deal of deals) {
      const tone = STAGE_STATUS[deal.stage];
      if (tone !== null) counts.set(tone, (counts.get(tone) ?? 0) + 1);
    }
    return CELLS.map((cell) => cell.tones.reduce((sum, tone) => sum + (counts.get(tone) ?? 0), 0));
  }, [deals]);

  return (
    <section aria-label="구간별 건수" className="hidden h-[62px] border-b border-hairline-cool px-2 lg:flex">
      <dl className="flex min-w-0 flex-1">
        {CELLS.map((cell, i) => (
          <div
            key={cell.key}
            className="flex min-w-0 max-w-[150px] flex-1 flex-col justify-center gap-[3px] border-r border-hairline-cool px-3 last:border-r-0"
          >
            <dt className="truncate text-[11.5px] text-ink-mute">{cell.label}</dt>
            <dd className="font-mono text-[20px] font-medium leading-none tracking-[-0.8px] tabular-nums text-ink">
              {formatCount(cellCounts[i])}
            </dd>
          </div>
        ))}
      </dl>
      {/* 가운데 열의 머리라 폭이 좁다(1024에서 약 640px) — 창 정보는 두 줄로 세워 칸을 덜 먹는다 */}
      <div className="ml-auto flex shrink-0 flex-col items-end justify-center gap-1 border-l border-hairline-cool pl-4 pr-3">
        <p className="text-[12px] text-ink-mute">
          <span className="font-medium text-ink">{windowLabel}</span> · 추적 중{" "}
          <span className="font-mono tabular-nums">{formatCount(deals.length)}</span>건
        </p>
        {openWindow && <DeadlineCountdown closesAt={openWindow.closesAt} serverNowMs={serverNowMs} />}
      </div>
    </section>
  );
});
