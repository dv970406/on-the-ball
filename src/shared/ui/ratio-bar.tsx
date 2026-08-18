import { COLOR } from "@/shared/config";
// ⚠ 배럴(`@/shared/lib`)이 아니라 직접 경로다 — 이 파일은 `"use client"`를 붙이지 않아
//   서버 렌더 여지를 남기는데, 배럴을 거치면 클라이언트 훅을 함께 끌고 와 그 여지를 잃는다
//   (사유는 `empty-state.tsx` 주석에).
import { cn } from "@/shared/lib/cn";

export interface RatioSegment {
  /** 0~1 비율 */
  ratio: number;
  color: string;
}

interface RatioBarProps {
  segments: RatioSegment[];
  /** px 높이 — 리스트 4 / 랭킹 5 / 응답 분석 8 */
  height?: number;
  trackColor?: string;
  className?: string;
}

/**
 * 얇은 비율 바 — width 변화를 이징으로 따라간다.
 *
 * ⚠ v1 자산이지만 투표 결과로 **현역이 되면서** 두 값을 규약에 맞췄다.
 *   - 트랙 색: `#f1f1f1` 하드코딩 → `COLOR.hairline`. 토큰에도 `COLOR`에도 없는 색이었다.
 *   - 지속시간: 500ms → 300ms. `styling.md`의 애니메이션 범위가 150–350ms다.
 *   미사용일 때는 무해했지만, 프로덕션에 올라온 순간부터 예외 목록을 조용히 늘리는 값이 된다.
 */
export function RatioBar({
  segments,
  height = 5,
  trackColor = COLOR.hairline,
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
          className="block h-full transition-[width] duration-300 ease-otb"
          style={{ width: `${Math.max(0, Math.min(1, seg.ratio)) * 100}%`, background: seg.color }}
        />
      ))}
    </div>
  );
}
