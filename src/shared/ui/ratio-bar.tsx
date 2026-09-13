"use client";

import { COLOR } from "@/shared/config";
// ⚠ 등장 모션 판정(`useEntranceMotion`)을 **이 안에서** 하므로 클라이언트 컴포넌트다. 판정을
//   호출부에 맡기면 "결과가 나중에 도착하는 화면"에서 부모의 마운트 시점이 기준이 되어 첫 투표의
//   리빌이 조용히 빠진다. 소비자(투표·입축구·승부예측 블록)가 전부 `"use client"`라 잃는 것이 없다.
import { cn, useEntranceMotion } from "@/shared/lib";

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
  /**
   * 마운트 순간 0에서 자라며 나타난다(X 투표·Polymarket의 결과 리빌). 값은 시작 지연(ms) —
   * 호출부가 막대 순서대로 60ms씩 늦춰 **순차 리빌**을 만든다.
   * ⚠ 하이드레이션에 그려지는 막대는 값이 있어도 자라지 않는다 — 판정은 안에서
   *   `useEntranceMotion`이 한다(`CountUp`과 같은 형태). SSR 결과에 걸리면 첫 페인트에서
   *   막대가 비었다가 자라는 시프트가 된다.
   */
  enterDelayMs?: number;
}

/**
 * 얇은 비율 바 — width 변화를 이징으로 따라간다.
 *
 * ⚠ 등장은 `width`가 아니라 **`transform: scaleX`** 로 자란다(`ratio-grow`) — 폭 애니메이션은
 *   프레임마다 리플로우를 부르고, 세그먼트 여러 개가 60ms 간격으로 겹치면 그게 쌓인다.
 *   그 뒤의 **변화**(갈아타기 낙관 반영)는 지금처럼 `width` 트랜지션이 따라간다 — 둘이
 *   다른 프로퍼티라 서로 간섭하지 않는다. 세그먼트에 표준 translate/scale 유틸이 없어
 *   키프레임의 transform과 합성될 것도 없다(styling.md).
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
  enterDelayMs,
}: RatioBarProps) {
  const play = useEntranceMotion();
  const enter = play && enterDelayMs !== undefined;
  return (
    <div
      className={cn("flex w-full overflow-hidden rounded-full", className)}
      style={{ height, background: trackColor }}
    >
      {segments.map((seg, i) => (
        <span
          key={i}
          className={cn(
            "block h-full origin-left transition-[width] duration-300 ease-otb",
            enter && "animate-[ratio-grow_320ms_cubic-bezier(0.2,0,0,1)_both]",
          )}
          style={{
            width: `${Math.max(0, Math.min(1, seg.ratio)) * 100}%`,
            background: seg.color,
            // 지연은 호출부가 정하는 런타임 값(막대 순서)이라 style이 맞다(styling.md)
            animationDelay: enter ? `${enterDelayMs}ms` : undefined,
          }}
        />
      ))}
    </div>
  );
}
