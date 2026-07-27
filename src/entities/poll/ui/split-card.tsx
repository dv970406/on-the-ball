"use client";

import type { CSSProperties } from "react";
import { cn } from "@/shared/lib";
import { PlayerSilhouette } from "@/shared/ui";
import { COLOR } from "@/shared/config";
import type { BalanceSide, PollOption } from "../model/types";
import { readSideMeta } from "../lib/balance-side";
import { VsBadge } from "./vs-badge";

interface SplitCardProps {
  /** A면 옵션 (poll_options.meta.side === 'a') */
  a: PollOption;
  /** B면 옵션 */
  b: PollOption;
  /** 4/5 = 홈 히어로, 3/4 = 밸런스 디테일 */
  aspect?: "4/5" | "3/4";
  /** 선택된 면 — 선택 면은 살짝 떠오르고 반대 면은 흐려진다 */
  picked?: BalanceSide | null;
  /** 면 탭 핸들러 — 없으면 표시 전용(카드 전체 탭은 부모가 담당) */
  onPick?: (side: BalanceSide) => void;
  /** 라틴 서브라벨(sublabel) 노출 — 디테일에서 true */
  showLatin?: boolean;
  /** VS 배지 등장 pop 애니메이션 */
  animateVs?: boolean;
  /** 거대 이름 폰트 크기(px) — 디테일 56(기본), 홈 46 */
  nameSize?: number;
}

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

      <VsBadge animate={animateVs} />
    </div>
  );
}

/**
 * 면별 clip-path 클래스 — 두 대각선이 지그재그 시임을 형성(42%/58% 좌표를 두 면이 공유).
 * browserslist 미설정이라 Tailwind가 벤더 prefix를 자동 생성하지 않는다 → -webkit- 병기.
 */
const CLIP: Record<BalanceSide, string> = {
  // A면: 헤어라인(좌 42% → 우 58%) 위쪽을 차지
  a: "[clip-path:polygon(0_0,100%_0,100%_58%,0_42%)] [-webkit-clip-path:polygon(0_0,100%_0,100%_58%,0_42%)]",
  // B면: 헤어라인 아래쪽을 차지
  b: "[clip-path:polygon(0_42%,100%_58%,100%_100%,0_100%)] [-webkit-clip-path:polygon(0_42%,100%_58%,100%_100%,0_100%)]",
};

interface SideHalfProps {
  side: BalanceSide;
  option: PollOption;
  picked: BalanceSide | null;
  onPick?: (side: BalanceSide) => void;
  showLatin: boolean;
  nameSize: number;
}

function SideHalf({ side, option, picked, onPick, showLatin, nameSize }: SideHalfProps) {
  const isA = side === "a";
  const isPicked = picked === side;
  const isDimmed = picked !== null && !isPicked;
  const { tone, text, metaLine } = readSideMeta(option);
  const isLightText = text === "#fff";

  // 탭한 면은 시임 반대 방향으로 살짝 떠오른다
  // ⚠ translate-*/scale-* 표준 유틸 금지 — 개별 프로퍼티로 출력되어 아래 [transition:transform ...]이
  //    잡지 못한다(트랜지션 없이 순간이동).
  const liftClassName = !isPicked
    ? "[transform:translateY(0)]"
    : isA
      ? "[transform:translateY(-2px)_scale(1.01)]"
      : "[transform:translateY(2px)_scale(1.01)]";

  const sideClassName = cn(
    "absolute inset-0 overflow-hidden",
    // transform 0.35s / opacity 0.25s — duration·easing이 서로 달라 단일 transition 유틸로 표현 불가
    "[transition:transform_0.35s_var(--ease-otb),opacity_0.25s_ease]",
    CLIP[side],
    isPicked ? "z-[3]" : "z-[1]",
    isDimmed ? "opacity-42" : "opacity-100",
    liftClassName,
  );

  // 면 색은 DB meta 런타임 값 — style 유지
  const sideStyle: CSSProperties = { background: tone, color: text };

  // 두 모드 공통 자식 — 실루엣 + 콘텐츠(뱃지·이름·메타)
  const content = (
    <>
      {/* 텍스트 반대 코너의 선수 실루엣 — A면 오른쪽 위, B면 왼쪽 아래(좌우 반전) */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute block w-[40%] opacity-10",
          isA ? "right-1 top-0" : "bottom-0 left-1 [transform:scaleX(-1)]",
        )}
      >
        <PlayerSilhouette tone={isLightText ? "#fff" : COLOR.ink} />
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
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-[5px] text-[12px] font-bold",
              // rgba(23,23,23,·) = #171717 = ink 토큰 (bg-black/8은 미세하게 어두워진다)
              isLightText ? "bg-white/18" : "bg-ink/8",
            )}
            style={{ color: text }}
          >
            {isA ? "A" : "B"}
          </span>
        </span>

        {/* 라틴 서브라벨 */}
        {showLatin && option.sublabel && (
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.6px] opacity-55">
            {option.sublabel}
          </span>
        )}

        {/* 거대 이름 */}
        <span
          className="block font-bold leading-[0.95] tracking-[-2px]"
          style={{ fontSize: nameSize }}
        >
          {option.label}
        </span>

        {/* 메타 라인 */}
        {metaLine && (
          <span className="mt-2 block text-[12px] opacity-70">{metaLine}</span>
        )}
      </span>
    </>
  );

  // 표시 전용(홈 히어로 — 카드 전체가 Link) — 비인터랙티브 div
  if (!onPick) {
    return (
      <div className={sideClassName} style={sideStyle}>
        {content}
      </div>
    );
  }

  // 투표 모드 — 네이티브 button (Enter/Space·포커스 링·커서를 브라우저가 제공)
  return (
    <button
      type="button"
      aria-pressed={isPicked}
      aria-label={`${option.label} 선택`}
      onClick={() => onPick(side)}
      className={cn(sideClassName, "cursor-pointer")}
      style={sideStyle}
    >
      {content}
    </button>
  );
}
