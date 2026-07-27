import { cn } from "@/shared/lib";

type LiveDotTone = "primary" | "ink";

interface LiveDotProps {
  tone?: LiveDotTone;
}

/**
 * tone별 배경·글로우 링 클래스 — primary는 에메랄드, ink는 중립 그레이.
 * ring-4는 `0 0 0 4px <색>` box-shadow와 동일하게 컴파일된다(ring-offset-width 기본 0px).
 * 글로우 색은 토큰 알파로 — primary는 --color-primary, ink 글로우는 잉크가 아닌 순수 검정이다.
 */
const DOT_TONE: Record<LiveDotTone, string> = {
  primary: "bg-primary ring-4 ring-primary/18",
  ink: "bg-ink ring-4 ring-black/6",
};

/** 라이브 상태 닷 — tone별 글로우 링 */
export function LiveDot({ tone = "primary" }: LiveDotProps) {
  return <span className={cn("inline-block size-1.5 rounded-full", DOT_TONE[tone])} />;
}
