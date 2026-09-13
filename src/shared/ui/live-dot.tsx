import { cn } from "@/shared/lib";

type LiveDotTone = "primary" | "ink" | "current";

interface LiveDotProps {
  tone?: LiveDotTone;
  /**
   * 숨 쉬듯 커졌다 작아진다(FotMob·Sofascore의 라이브 표시).
   * ⚠ 끝이 없는 표시라 150–350ms 규칙 밖이다 — 스피너와 같은 예외(styling.md).
   */
  pulse?: boolean;
  /** 자리 잡기용(예: 글로우 링이 옆 글자에 닿지 않게 `mr-0.5`) */
  className?: string;
}

/**
 * tone별 배경·글로우 링 클래스 — primary는 에메랄드, ink는 중립 그레이, current는 부모 글자색.
 * ring-4는 `0 0 0 4px <색>` box-shadow와 동일하게 컴파일된다(ring-offset-width 기본 0px).
 * 글로우 색은 토큰 알파로 — primary는 --color-primary, ink 글로우는 잉크가 아닌 순수 검정이다.
 *
 * ⚠ `current`는 **`dark` Pill 안**을 위한 것이다("진행 중" 배지). 잉크 바탕 위에 `ink` 도트는
 *   보이지 않고, `primary`는 목록에 진행 중 경기가 여럿이면 에메랄드가 카드 수만큼 늘어
 *   "한 뷰포트당 컬러 이벤트 1개"가 깨진다 — 배지의 글자색(흰색)을 그대로 따른다.
 */
const DOT_TONE: Record<LiveDotTone, string> = {
  primary: "bg-primary ring-4 ring-primary/18",
  ink: "bg-ink ring-4 ring-black/6",
  current: "bg-current ring-4 ring-current/20",
};

/** 라이브 상태 닷 — tone별 글로우 링 */
export function LiveDot({ tone = "primary", pulse = false, className }: LiveDotProps) {
  return (
    <span
      className={cn(
        "inline-block size-1.5 rounded-full",
        DOT_TONE[tone],
        // 표준 scale 유틸이 없는 요소라 키프레임의 transform과 합성될 것이 없다(styling.md)
        pulse && "animate-[live-pulse_1.6s_ease-in-out_infinite]",
        className,
      )}
    />
  );
}
