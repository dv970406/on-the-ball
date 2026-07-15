"use client";

import type { KeyboardEvent } from "react";
import { cn } from "@/shared/lib";
import { PlayerSilhouette } from "@/shared/ui";
import type { PollOption } from "../model/types";
import { readSideMeta } from "../lib/balance-side";
import { VsBadge } from "./vs-badge";

type Side = "a" | "b";

type SplitCardProps = {
  /** A면 옵션 (poll_options.meta.side === 'a') */
  a: PollOption;
  /** B면 옵션 */
  b: PollOption;
  /** 4/5 = 홈 히어로, 3/4 = 밸런스 디테일 */
  aspect?: "4/5" | "3/4";
  /** 선택된 면 — 선택 면은 살짝 떠오르고 반대 면은 흐려진다 */
  picked?: Side | null;
  /** 면 탭 핸들러 — 없으면 표시 전용(카드 전체 탭은 부모가 담당) */
  onPick?: (side: Side) => void;
  /** 라틴 서브라벨(sublabel) 노출 — 디테일에서 true */
  showLatin?: boolean;
  /** VS 배지 등장 pop 애니메이션 */
  animateVs?: boolean;
  /** 거대 이름 폰트 크기(px) — 디테일 56(기본), 홈 46 */
  nameSize?: number;
};

/**
 * 대각선 스플릿 카드 — 밸런스 게임의 시그니처 (홈 히어로 + 밸런스 디테일 공용).
 * 프로토타입 screen-balance.jsx의 DiagonalSplit을 Tailwind로 재현.
 * 두 면의 clip-path가 지그재그 대각선 시임을 만들고, 탭한 면이 zIndex로 위에 뜬다.
 */
export function SplitCard({
  a,
  b,
  aspect = "4/5",
  picked = null,
  onPick,
  showLatin = false,
  animateVs = false,
  nameSize = 56,
}: SplitCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[18px] shadow-[0_10px_28px_rgba(0,0,0,0.08)]",
        aspect === "4/5" ? "aspect-[4/5]" : "aspect-[3/4]",
      )}
    >
      <SideHalf
        side="a"
        option={a}
        picked={picked}
        onPick={onPick}
        showLatin={showLatin}
        nameSize={nameSize}
      />
      <SideHalf
        side="b"
        option={b}
        picked={picked}
        onPick={onPick}
        showLatin={showLatin}
        nameSize={nameSize}
      />

      {/* 데코 헤어라인 — 시임을 암시하는 순수 장식 (탭 이벤트 차단 금지) */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[2]"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <line
          x1="0"
          y1="42"
          x2="100"
          y2="58"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="0.4"
        />
      </svg>

      <VsBadge animate={animateVs} />
    </div>
  );
}

/** 면별 clip-path — 두 대각선이 지그재그 시임을 형성 */
const CLIP: Record<Side, string> = {
  // A면: 왼쪽 아래 삼각형을 잘라내 시임 위쪽을 차지
  a: "polygon(0 0, 100% 0, 100% 100%, 0 58%)",
  // B면: 왼쪽 위 삼각형을 잘라내 시임 아래쪽을 차지
  b: "polygon(0 42%, 100% 0, 100% 100%, 0 100%)",
};

type SideHalfProps = {
  side: Side;
  option: PollOption;
  picked: Side | null;
  onPick?: (side: Side) => void;
  showLatin: boolean;
  nameSize: number;
};

function SideHalf({ side, option, picked, onPick, showLatin, nameSize }: SideHalfProps) {
  const isA = side === "a";
  const isPicked = picked === side;
  const isDimmed = picked !== null && !isPicked;
  const { tone, text, metaLine } = readSideMeta(option);
  const isLightText = text === "#fff";

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPick?.(side);
    }
  };

  return (
    <div
      role={onPick ? "button" : undefined}
      tabIndex={onPick ? 0 : undefined}
      aria-pressed={onPick ? isPicked : undefined}
      aria-label={onPick ? `${option.label} 선택` : undefined}
      onClick={onPick ? () => onPick(side) : undefined}
      onKeyDown={onPick ? handleKeyDown : undefined}
      className={cn(
        "absolute inset-0 overflow-hidden",
        onPick ? "cursor-pointer" : undefined,
      )}
      style={{
        background: tone,
        color: text,
        clipPath: CLIP[side],
        WebkitClipPath: CLIP[side],
        zIndex: isPicked ? 3 : 1,
        opacity: isDimmed ? 0.42 : 1,
        // 탭한 면은 시임 반대 방향으로 살짝 떠오른다
        transform: isPicked
          ? `translateY(${isA ? -2 : 2}px) scale(1.01)`
          : "translateY(0)",
        transition: "transform 0.35s var(--ease-otb), opacity 0.25s ease",
      }}
    >
      {/* 텍스트 반대 코너의 선수 실루엣 — A면 오른쪽 위, B면 왼쪽 아래(좌우 반전) */}
      <span
        aria-hidden
        className="pointer-events-none absolute block w-[40%] opacity-10"
        style={{
          top: isA ? 0 : "auto",
          bottom: isA ? "auto" : 0,
          right: isA ? 4 : "auto",
          left: isA ? "auto" : 4,
          transform: isA ? undefined : "scaleX(-1)",
        }}
      >
        <PlayerSilhouette tone={isLightText ? "#fff" : "#171717"} />
      </span>

      {/* 콘텐츠 — A는 왼쪽 위, B는 오른쪽 아래에 앵커 */}
      <span
        className={cn(
          "absolute left-[22px] right-[22px] block",
          isA ? "top-[22px] text-left" : "bottom-8 text-right",
        )}
      >
        {/* A/B 뱃지 */}
        <span className={cn("mb-2 flex", isA ? "justify-start" : "justify-end")}>
          <span
            className="flex h-6 w-6 items-center justify-center rounded-[5px] text-[12px] font-bold"
            style={{
              background: isLightText
                ? "rgba(255,255,255,0.18)"
                : "rgba(23,23,23,0.08)",
              color: text,
            }}
          >
            {isA ? "A" : "B"}
          </span>
        </span>

        {/* 라틴 서브라벨 */}
        {showLatin && option.sublabel ? (
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.6px] opacity-55">
            {option.sublabel}
          </span>
        ) : null}

        {/* 거대 이름 */}
        <span
          className="block font-bold"
          style={{ fontSize: nameSize, letterSpacing: "-2px", lineHeight: 0.95 }}
        >
          {option.label}
        </span>

        {/* 메타 라인 */}
        {metaLine ? (
          <span className="mt-2 block text-[12px] opacity-70">{metaLine}</span>
        ) : null}
      </span>
    </div>
  );
}
