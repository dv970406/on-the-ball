import { ArrowDown, ArrowUp } from "lucide-react";
// ⚠ 배럴이 아니라 직접 경로다 — `"use client"`가 없어 서버 렌더 여지를 남긴다(`pill.tsx`와 같은 이유)
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui";
import { feeDelta } from "../lib/fee";
import type { TransferDeal } from "../model/types";

interface FeeDeltaProps {
  deal: Pick<TransferDeal, "feeAmount" | "prevFeeAmount" | "feeCurrency">;
  /** 앞에 `직전 보도 대비` 라벨을 붙인다(목록 행·미니 카드) */
  lead?: boolean;
  /** 값의 글자 크기 등 — 기본 11px. 상세 KV 칸은 14px을 준다 */
  className?: string;
}

/**
 * 직전 보도 대비 변동폭 — `ArrowUp`/`ArrowDown` 11 + **한 텍스트 노드**(`€10M`).
 * 금액을 한 노드로 두는 이유는 flex gap이 문자 사이에 끼지 않게 하기 위해서다.
 *
 * ⚠ **색이 정보를 혼자 지지 않는다** — 방향은 아이콘이 함께 진다. 상승은 `text-primary-deep`
 *   (에메랄드 계열이지만 CTA가 아니라 콘텐츠 값의 방향 표시), 하락은 `text-crimson`.
 *   `check:conventions`의 `text-primary` 대조에 이 파일이 걸리는 것은 `text-primary-deep`이
 *   부분 문자열이기 때문이다 — `styling.md`의 에메랄드 표에 그 사유로 등재돼 있다.
 * ⚠ 변동이 없거나 직전 보도가 없으면 `—`(`text-ink-faint`). 아이콘 없이 텍스트만이라
 *   "변동 없음"과 "모름"을 가르지 않는다 — 어느 쪽이든 화면이 말할 것이 없다.
 * ⚠ **이적료 자체가 없으면(FA · 미공개) 아무것도 그리지 않는다** — 비교할 금액이 없는데
 *   "직전 보도 대비 —"를 남기면 빈 칸이 하나 더 는다. 판정을 여기 두어 호출부가 각자 기억하지 않는다.
 */
export function FeeDelta({ deal, lead, className }: FeeDeltaProps) {
  if (deal.feeAmount === null) return null;
  const delta = feeDelta(deal);
  const value =
    delta === null ? (
      <span className="font-mono tabular-nums text-ink-faint">—</span>
    ) : (
      <span
        className={cn(
          "inline-flex items-center gap-0.5 whitespace-nowrap font-mono tabular-nums",
          delta.direction === "up" ? "text-primary-deep" : "text-crimson",
        )}
      >
        <Icon as={delta.direction === "up" ? ArrowUp : ArrowDown} size={11} />
        {delta.text}
      </span>
    );

  if (!lead) {
    return (
      <span className={cn("inline-flex items-center whitespace-nowrap text-[11px]", className)}>
        {value}
      </span>
    );
  }
  return (
    <span
      className={cn("inline-flex items-center gap-[5px] whitespace-nowrap text-[11px]", className)}
    >
      <span className="font-sans text-[10px] text-ink-mute">직전 보도 대비</span>
      {value}
    </span>
  );
}
