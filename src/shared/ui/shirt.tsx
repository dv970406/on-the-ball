import { useId } from "react";

export type ShirtStripe = "sash" | "h" | "v" | null;

interface ShirtProps {
  /** 유니폼 메인 컬러 (클럽 컬러 — 콘텐츠 컬러로 허용) */
  tone: string;
  stripe?: ShirtStripe;
  /** 밝은 유니폼용 대비 플래그 (토트넘 화이트 등) */
  dark?: boolean;
}

/** 유니폼 SVG placeholder — 실제 킷 이미지로 교체 예정 */
export function Shirt({ tone, stripe = null, dark = false }: ShirtProps) {
  const clipId = useId();
  const shirtPath =
    "M40 20 L52 14 Q60 24 68 14 L80 20 L100 30 L92 50 L82 46 L82 100 Q60 108 38 100 L38 46 L28 50 L20 30 Z";

  return (
    <svg viewBox="0 0 120 120" width="78%" height="78%" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <path d={shirtPath} />
        </clipPath>
      </defs>

      <path d={shirtPath} fill={tone} />

      <g clipPath={`url(#${clipId})`}>
        {stripe === "v" && (
          <>
            <rect x="48" y="0" width="8" height="120" fill="rgba(255,255,255,0.22)" />
            <rect x="64" y="0" width="8" height="120" fill="rgba(255,255,255,0.22)" />
          </>
        )}
        {stripe === "h" && (
          <>
            <rect
              x="0"
              y="40"
              width="120"
              height="6"
              fill={dark ? "rgba(13,30,80,0.85)" : "rgba(255,255,255,0.2)"}
            />
            <rect
              x="0"
              y="56"
              width="120"
              height="6"
              fill={dark ? "rgba(13,30,80,0.85)" : "rgba(255,255,255,0.2)"}
            />
          </>
        )}
        {stripe === "sash" && (
          <rect
            x="-20"
            y="42"
            width="180"
            height="16"
            transform="rotate(-18 60 60)"
            fill="rgba(255,255,255,0.32)"
          />
        )}
      </g>

      {/* 외곽선 */}
      <path
        d={shirtPath}
        fill="none"
        stroke={dark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.2)"}
        strokeWidth="1"
      />
    </svg>
  );
}
