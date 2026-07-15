import { cn } from "@/shared/lib";

export type RatioSegment = {
  /** 0~1 비율 */
  ratio: number;
  color: string;
};

type RatioBarProps = {
  segments: RatioSegment[];
  /** px 높이 — 리스트 4 / 랭킹 5 / 응답 분석 8 */
  height?: number;
  trackColor?: string;
  className?: string;
};

/** 얇은 비율 바 — width 변화 시 0.5s otb 이징으로 애니메이션 */
export function RatioBar({
  segments,
  height = 5,
  trackColor = "#f1f1f1",
  className,
}: RatioBarProps) {
  return (
    <div
      className={cn("flex w-full overflow-hidden rounded-full", className)}
      style={{ height, background: trackColor }}
    >
      {segments.map((seg, i) => (
        <span
          key={i}
          className="block h-full transition-[width] duration-500 ease-otb"
          style={{ width: `${Math.max(0, Math.min(1, seg.ratio)) * 100}%`, background: seg.color }}
        />
      ))}
    </div>
  );
}
