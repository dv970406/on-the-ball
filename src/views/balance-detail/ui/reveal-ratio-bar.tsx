"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { Icon, Pill } from "@/shared/ui";
import { formatCount } from "@/shared/lib";
import type { BalanceSideMeta, PollOption } from "@/entities/poll";

type Side = "a" | "b";

type RevealRatioBarProps = {
  a: PollOption;
  b: PollOption;
  aMeta: BalanceSideMeta;
  bMeta: BalanceSideMeta;
  /** 득표 우세 면 — 동률이면 null (WIN pill 미표시) */
  winner: Side | null;
  /** 내가 투표한 면 — 없으면 마커 미노출 (마감 후 미투표 열람) */
  mySide: Side | null;
};

/**
 * 결과 리빌의 센터피스 — 56px 비율 바.
 * 공용 RatioBar는 얇은 바 전용이라 여기서 자체 구현:
 * 두 블록(각 면 tone/text), 퍼센트 22px/700, mount 후 width 0→실값 0.8s ease-otb,
 * 승자 WIN pill, 내 표 위치 마커.
 */
export function RevealRatioBar({ a, b, aMeta, bMeta, winner, mySide }: RevealRatioBarProps) {
  // mount 후 한 프레임 뒤 실값으로 — 0에서 시작하는 width 트랜지션 보장
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const aPct = a.ratio * 100;
  const bPct = b.ratio * 100;

  return (
    <div>
      {/* 이름 + WIN pill */}
      <div className="mb-2 flex items-baseline">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[16px] font-semibold text-ink">{a.label}</span>
          {winner === "a" ? <WinPill /> : null}
        </div>
        <div className="ml-auto flex items-baseline gap-1.5">
          {winner === "b" ? <WinPill /> : null}
          <span className="text-[16px] font-semibold text-ink">{b.label}</span>
        </div>
      </div>

      {/* 두 블록 비율 바 */}
      <div className="flex h-14 overflow-hidden rounded-lg border border-hairline bg-canvas-soft">
        <div
          className="flex min-w-0 items-center justify-start overflow-hidden whitespace-nowrap px-3.5 text-[22px] font-bold tracking-[-0.6px] transition-[width] duration-[800ms] ease-otb"
          style={{
            width: `${grown ? aPct : 0}%`,
            background: aMeta.tone,
            color: aMeta.text,
          }}
        >
          {aPct.toFixed(1)}%
        </div>
        <div
          className="flex min-w-0 items-center justify-end overflow-hidden whitespace-nowrap px-3.5 text-[22px] font-bold tracking-[-0.6px] transition-[width] duration-[800ms] ease-otb"
          style={{
            width: `${grown ? bPct : 0}%`,
            background: bMeta.tone,
            color: bMeta.text,
          }}
        >
          {bPct.toFixed(1)}%
        </div>
      </div>

      {/* 양측 득표수 */}
      <div className="tnum mt-1.5 flex font-mono text-[11px] text-ink-mute">
        <span className="whitespace-nowrap">{formatCount(a.votes)}표</span>
        <span className="ml-auto whitespace-nowrap">{formatCount(b.votes)}표</span>
      </div>

      {/* 내 표 위치 마커 — A/B 경계 기준 내 면 쪽 */}
      {mySide ? (
        <div className="relative mt-0.5 h-2">
          <span
            className="absolute -top-0.5 inline-flex items-center gap-[3px] whitespace-nowrap font-mono text-[10px] text-primary-deep"
            style={{
              left:
                mySide === "a"
                  ? `calc(${aPct}% - 1px - 30px)`
                  : `calc(${aPct}% + 1px + 6px)`,
            }}
          >
            <Icon as={ArrowUp} size={10} />내 표
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** 승자 표시 소형 pill */
function WinPill() {
  return (
    <Pill variant="green" className="px-1.5 py-0.5 text-[9px]">
      WIN
    </Pill>
  );
}
