type LiveDotProps = {
  color?: string;
};

/** 라이브 상태 닷 — 에메랄드 글로우 링 */
export function LiveDot({ color = "var(--color-primary)" }: LiveDotProps) {
  const isPrimary = color === "var(--color-primary)";
  return (
    <span
      className="inline-block size-1.5 rounded-full"
      style={{
        background: color,
        boxShadow: `0 0 0 4px ${isPrimary ? "rgba(62,207,142,0.18)" : "rgba(0,0,0,0.06)"}`,
      }}
    />
  );
}
