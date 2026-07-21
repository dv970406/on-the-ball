import type { ReactNode } from "react";
import { cn, formatCount, formatDday, isClosed } from "@/shared/lib";

interface PollMetaStripProps {
  /** 좌측 상태 pill — 뷰별 변주(green+LiveDot / LiveStatusPill / outline)를 그대로 전달 */
  pill: ReactNode;
  totalVotes: number;
  closesAt: string | null;
  /** 득표수 뒤 접미사 (기본 "명 투표") */
  countSuffix?: ReactNode;
  /** 외부 여백 등 (예: "mb-2.5") */
  className?: string;
}

/**
 * 폴 메타 줄 — 상태 pill + 득표수 + 마감 D-day.
 * 마감된 폴이면 isClosed 가드로 D-day 세그먼트를 생략한다("마감 마감" 방지).
 * 마감 표기 자체는 pill이 담당.
 */
export function PollMetaStrip({
  pill,
  totalVotes,
  closesAt,
  countSuffix = "명 투표",
  className,
}: PollMetaStripProps) {
  const showDday = closesAt !== null && !isClosed(closesAt);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {pill}
      <span className="whitespace-nowrap text-[12px] text-ink-mute">
        <span className="tnum font-mono text-ink">{formatCount(totalVotes)}</span>
        {countSuffix}
      </span>
      {showDday && (
        <>
          <span className="text-[12px] text-ink-mute-2">·</span>
          <span className="whitespace-nowrap text-[12px] text-ink-mute">
            마감 <time dateTime={closesAt ?? undefined}>{formatDday(closesAt)}</time>
          </span>
        </>
      )}
    </div>
  );
}
