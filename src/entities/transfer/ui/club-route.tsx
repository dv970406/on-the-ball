import { ArrowRight, X } from "lucide-react";
// ⚠ 배럴이 아니라 직접 경로다 — `"use client"`가 없어 서버 렌더 여지를 남긴다(`pill.tsx`와 같은 이유)
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui";
import type { TransferClub } from "../model/types";
import { TransferCrest } from "./transfer-crest";

/** 방향을 못 읽은 구단의 표기 — "틀린 칸보다 빈 칸"(계획서 §2-3) */
const UNKNOWN_CLUB_LABEL = "미확인";

interface ClubRouteProps {
  from: TransferClub | null;
  to: TransferClub | null;
  /** 엠블럼 px */
  size: number;
  /** 결렬 — 화살표 대신 X 원, 행선지 로고·약칭에 취소선 */
  dead?: boolean;
  className?: string;
}

/**
 * `로고 약칭 → 로고 약칭` — 행선지만 `font-medium text-ink`로 강조한다(handoff §4-8 경로 줄).
 * ⚠ **약칭이다**(정식명은 상세 경로 카드만) — 좁은 폭에 두 구단을 놓는 자리에서 정식명은 잘리고,
 *   잘린 구단 이름은 어느 구단인지 알 수 없다(`Team.shortName`과 같은 판단).
 * ⚠ 결렬의 X 원(`rounded-full`)은 컨트롤이 아니라 표시 요소 — `styling.md` "대상이 아닌 것".
 *   크림슨 채움이지만 행 전체가 `grayscale`이라 회색으로 보인다(색이 아니라 X 형태가 뜻을 진다).
 */
export function ClubRoute({ from, to, size, dead, className }: ClubRouteProps) {
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-[5px] whitespace-nowrap text-[12px] text-ink-mute",
        className,
      )}
    >
      <span className="inline-flex min-w-0 items-center gap-[5px]">
        <TransferCrest club={from} size={size} />
        <span className="truncate">{from?.shortName ?? UNKNOWN_CLUB_LABEL}</span>
      </span>
      {dead ? (
        <span
          aria-hidden
          className="inline-grid size-4 shrink-0 place-items-center rounded-full bg-crimson text-white"
        >
          <Icon as={X} size={11} />
        </span>
      ) : (
        <Icon as={ArrowRight} size={12} className="shrink-0 text-ink-faint" />
      )}
      {/* 스크린리더용 — 아이콘이 `aria-hidden`이라 방향이 읽히지 않는다 */}
      <span className="sr-only">{dead ? "결렬" : "에서"}</span>
      <span
        className={cn(
          "inline-flex min-w-0 items-center gap-[5px]",
          dead
            ? "font-normal text-ink-mute-2 line-through decoration-hairline-strong"
            : "font-medium text-ink",
        )}
      >
        <TransferCrest club={to} size={size} className={dead ? "opacity-50" : undefined} />
        <span className="truncate">{to?.shortName ?? UNKNOWN_CLUB_LABEL}</span>
      </span>
    </span>
  );
}
