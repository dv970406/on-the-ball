type PlayerSilhouetteProps = {
  /** 실루엣 색 (기본: 밝은 톤) */
  tone?: string;
  className?: string;
};

/** 선수 실루엣 placeholder — 실제 선수 컷아웃 사진으로 교체 예정 */
export function PlayerSilhouette({
  tone = "rgba(255,255,255,0.85)",
  className,
}: PlayerSilhouetteProps) {
  return (
    <svg viewBox="0 0 120 160" className={className} style={{ width: "100%", display: "block" }} aria-hidden>
      {/* 머리 */}
      <circle cx="60" cy="34" r="20" fill={tone} />
      {/* 어깨 + 몸통 */}
      <path d="M16 160 L16 96 Q16 64 60 60 Q104 64 104 96 L104 160 Z" fill={tone} />
    </svg>
  );
}
