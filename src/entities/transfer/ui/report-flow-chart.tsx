"use client";

import { type ReactNode, useMemo, useState } from "react";
import { cn } from "@/shared/lib";
import { Skeleton } from "@/shared/ui";
import { REPORT_FLOW_RANGE_LABEL, type ReportFlowRange, reportFlow, reportFlowSummary } from "../lib/report-flow";
import type { TransferReport } from "../model/types";

interface ReportFlowChartProps {
  /** 제목 — 자리마다 제목 단계가 달라(상세 h2 · 오른쪽 판 h3) 호출부가 만든다. 기간 토글과 한 줄에 놓인다 */
  title: ReactNode;
  /** `undefined`면 아직 받지 못한 것(로딩 또는 실패) — `[]`는 "받았는데 없다" */
  reports: TransferReport[] | undefined;
  error: Error | null;
  onRetry: () => void;
  /** 기간의 끝 — `serverNowMs ?? useNowMs()`는 호출부가 한다 */
  nowMs: number | null;
  className?: string;
}

const RANGES: ReportFlowRange[] = ["1w", "3w", "all"];

/** viewBox의 하루 폭 — 막대는 그중 가운데 60%다. 실제 폭은 컨테이너가 정한다(`preserveAspectRatio="none"`) */
const SLOT = 10;
const BAR = 6;
/** 플롯 높이 — `h-24`(96px)와 같아 세로 단위가 곧 px이다(겹친 막대 사이 2px 간격이 그대로 2px로 그려진다) */
const PLOT_H = 96;
/** 위쪽 여유 — 가장 높은 막대가 상자 끝에 닿지 않게 */
const HEADROOM = 6;
const GAP = 2;
const SCALE_FLOOR = 4;

/**
 * 보도 흐름 — 날짜 축 위 하루 보도 수 막대. 믿을 만한 출처(🎖️·🌕·🌖)는 **채운** 잉크, 그 밖은 **빈** 테두리로 한 막대에 쌓는다.
 *
 * - ⚠ **단계 흐름선·보도 이적료 점선을 그리지 않는다** — 데이터가 뱃지와 다른 판정이라서다(`lib/report-flow.ts`).
 * - ⚠ 색은 잉크·회색 래더뿐이다(에메랄드는 CTA 자리다). 두 계열을 **채움/빈 테두리**로도 가른다 — 색이 혼자 뜻을 지지 않는다.
 * - 축은 하나다(보도 수). 눈금 대신 범례 줄에 "하루 최대 N건"을 적는다 — 막대가 몇 개 안 되는 차트에 눈금선은 소음이다.
 * - 보도가 있는 날마다 `<title>`이 붙어 마우스를 올리면 그날의 수가 뜬다. 스크린리더에는 그림 전체의 요약 한 문장(`aria-label`)이 간다 —
 *   항목별 내용은 바로 옆 보도 타임라인이 같은 데이터를 목록으로 준다.
 * - 기간은 1주 · 3주 · 전체. 기본은 3주이고, 3주 안에 보도가 없으면(지난 창의 딜) 전체로 연다.
 */
export function ReportFlowChart({ title, reports, error, onRetry, nowMs, className }: ReportFlowChartProps) {
  const [picked, setPicked] = useState<ReportFlowRange | null>(null);
  const recent = useMemo(() => (reports ? reportFlow(reports, "3w", nowMs).total : 0), [reports, nowMs]);
  const range: ReportFlowRange = picked ?? (recent > 0 ? "3w" : "all");
  const flow = useMemo(() => (reports ? reportFlow(reports, range, nowMs) : null), [reports, range, nowMs]);

  const max = flow ? Math.max(1, ...flow.days.map((d) => d.top + d.other)) : 1;
  // 눈금의 꼭대기는 최소 4건이다 — 하루 1건뿐인 딜이 플롯 높이를 꽉 채우면 "보도가 몰렸다"로 읽힌다
  const unit = (PLOT_H - HEADROOM) / Math.max(SCALE_FLOOR, max);
  const width = flow ? flow.days.length * SLOT : SLOT;
  const mid = flow ? flow.days[Math.floor((flow.days.length - 1) / 2)] : null;

  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">{title}</div>
        {reports !== undefined && reports.length > 0 && (
          // 기간 — 제자리에서 다시 그리는 선택 토글이라 `aria-pressed`(보도 정렬과 같은 형태)
          <div className="flex shrink-0 overflow-hidden rounded-sm border border-hairline">
            {RANGES.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={range === key}
                onClick={() => setPicked(key)}
                className={cn(
                  // 글자는 12px이지만 히트 영역은 투명 의사요소로 세로 44px
                  "relative h-7 px-2.5 text-[12px] text-ink-mute transition-colors duration-150 ease-otb after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']",
                  range === key && "bg-ink font-medium text-white",
                )}
              >
                {REPORT_FLOW_RANGE_LABEL[key]}
              </button>
            ))}
          </div>
        )}
      </div>

      {reports === undefined && error === null && (
        // 골격은 실제 그림(막대 96 + 날짜 축 + 범례)과 같은 높이다
        <div aria-hidden className="mt-3">
          <Skeleton className="h-[136px] w-full" />
        </div>
      )}

      {reports === undefined && error !== null && (
        <p className="mt-3 text-[12px] text-ink-mute">
          보도를 불러오지 못했어요.{" "}
          <button type="button" onClick={onRetry} className="underline underline-offset-2">
            다시 시도
          </button>
        </p>
      )}

      {reports !== undefined && reports.length === 0 && (
        <p className="mt-3 text-[12px] text-ink-mute">아직 연결된 보도가 없어요.</p>
      )}

      {flow !== null && reports !== undefined && reports.length > 0 && (
        <figure className="mt-3">
          <svg
            role="img"
            aria-label={reportFlowSummary(flow, range)}
            viewBox={`0 0 ${width} ${PLOT_H}`}
            preserveAspectRatio="none"
            className="block h-24 w-full overflow-visible"
          >
            {/* 바닥선 — 막대가 서 있는 기준. 눈금선은 두지 않는다 */}
            <line
              x1={0}
              x2={width}
              y1={PLOT_H - 0.5}
              y2={PLOT_H - 0.5}
              className="stroke-hairline"
              vectorEffect="non-scaling-stroke"
            />
            {flow.days.map((d, i) => {
              // 보도가 없는 날은 아무것도 그리지 않는다(막대도 0건 툴팁도) — 빈 날까지 칸을 그리면 이 그림이 상세 HTML에서
              // 날 수만큼 무거워진다(넓은 화면 전용인데 서버 HTML에는 모든 폭에 실린다). 빈 날은 바닥선이 말한다
              if (d.top + d.other === 0) return null;
              const x = i * SLOT + (SLOT - BAR) / 2;
              const topH = d.top * unit;
              const otherH = d.other * unit;
              // 채운 막대가 아래(바닥에 붙는다), 빈 막대가 그 위 — 둘 사이에 2px 간격
              const otherY = PLOT_H - topH - (d.top > 0 ? GAP : 0) - otherH;
              return (
                <g key={d.day}>
                  {/* ⚠ 자식은 **문자열 하나**다 — 여러 조각이면 서버가 조각 사이에 주석 노드를 끼워 하이드레이션이 갈린다 */}
                  <title>{`${d.label} · 보도 ${d.top + d.other}건${d.top > 0 ? `(믿을 만한 출처 ${d.top}건)` : ""}`}</title>
                  {/* 히트 영역 — 막대보다 크게(그날의 칸 전체) */}
                  <rect x={i * SLOT} y={0} width={SLOT} height={PLOT_H} className="fill-transparent" />
                  {d.top > 0 && <rect x={x} y={PLOT_H - topH} width={BAR} height={topH} className="fill-ink" />}
                  {d.other > 0 && (
                    <rect
                      x={x + 0.5}
                      y={otherY + 0.5}
                      width={BAR - 1}
                      height={Math.max(otherH - 1, 1)}
                      className="fill-canvas stroke-ink-mute-2"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </g>
              );
            })}
          </svg>
          {/* 날짜 축 — 처음 · 가운데 · 끝. SVG 글자는 가로로 늘어나므로 HTML로 둔다 */}
          <div aria-hidden className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums text-ink-mute-2">
            <span>{flow.days[0]?.label}</span>
            {mid && <span>{mid.label}</span>}
            <span>{flow.days.at(-1)?.label}</span>
          </div>
          <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-mute">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 bg-ink" />
              믿을 만한 출처
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 border border-ink-mute-2 bg-canvas" />
              그 밖의 출처
            </span>
            {/* 숫자만 mono다 — 한글에 mono를 걸면 서브셋에 없는 글자가 대체 폰트로 떨어진다(`FeeValue` 주석) */}
            <span className="ml-auto text-ink-mute-2">
              하루 최대 <span className="font-mono tabular-nums">{max}</span>건
            </span>
          </figcaption>
        </figure>
      )}
    </div>
  );
}
