import { COLOR } from "@/shared/config";

type LiveDotTone = "primary" | "ink";

type LiveDotProps = {
  tone?: LiveDotTone;
};

/** tone별 배경·글로우 링 색 — primary는 에메랄드, ink는 중립 그레이 */
const DOT_TONE: Record<LiveDotTone, { background: string; glow: string }> = {
  primary: { background: COLOR.primary, glow: "rgba(62,207,142,0.18)" },
  ink: { background: COLOR.ink, glow: "rgba(0,0,0,0.06)" },
};

/** 라이브 상태 닷 — tone별 글로우 링 */
export function LiveDot({ tone = "primary" }: LiveDotProps) {
  const { background, glow } = DOT_TONE[tone];
  return (
    <span
      className="inline-block size-1.5 rounded-full"
      style={{
        background,
        boxShadow: `0 0 0 4px ${glow}`,
      }}
    />
  );
}
