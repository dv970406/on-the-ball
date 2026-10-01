// ⚠ 배럴이 아니라 직접 경로다 — `"use client"`가 없어 서버 렌더 여지를 남긴다(`fee-delta.tsx`와 같은 이유)
import { cn } from "@/shared/lib/cn";
import { feeKindCaption, feeLabel } from "../lib/fee";
import type { TransferDeal } from "../model/types";

interface FeeValueProps {
  deal: Pick<TransferDeal, "feeAmount" | "feeCurrency" | "feeKind" | "isFreeAgent">;
  /** 크기·자간·색·취소선 등 — 호출부의 칸이 정한다(금액 기준) */
  className?: string;
  /**
   * 금액이 **아닐 때**(FA · 미공개)의 글자 크기 — 기본 13px.
   * ⚠ 금액 크기를 그대로 물려받으면 `FA(자유 계약)`처럼 긴 한글 라벨이 금액 자리에서 두드러진다 —
   *   숫자 칸의 크기는 숫자를 위한 것이라 라벨은 한 단계 작게 그린다.
   */
  labelClassName?: string;
  /** 금액의 성격(제안액·요구액…)을 금액 옆에 작게 붙인다 — 기본 켬. 칸의 제목이 이미 성격을 말하는 자리(상세 카드)만 끈다 */
  caption?: boolean;
}

/**
 * 이적료 칸의 값 — 금액이면 `€95M`, 자유계약이 확인됐으면 `FA(자유 계약)`, 아니면 `미공개`.
 *
 * ⚠ **숫자만 mono + `tabular-nums`다.** 한글 라벨에 mono를 걸면 서브셋에 없는 글자가 대체 폰트로
 *   떨어져 자간이 들쭉날쭉해진다(JetBrains Mono 서브셋은 라틴·숫자·부호뿐 — `src/app/fonts/README.md`).
 * ⚠ `미공개`는 한 단계 흐리게 그린다 — 값이 아니라 "모름"이라 금액·FA와 같은 무게로 읽히면 안 된다.
 * ⚠ **실제 이적료가 아닌 금액은 성격을 함께 그린다**(`£86M 요구액`) — 금액만 두면 그 값에 이적한 것으로 읽힌다.
 *   표시는 한글이라 mono를 벗기고 한 단계 작고 흐리게 둔다(값이 아니라 값의 설명이다).
 */
export function FeeValue({ deal, className, labelClassName = "text-[13px]", caption = true }: FeeValueProps) {
  const label = feeLabel(deal);
  const kind = caption && label.kind === "fee" ? feeKindCaption(deal.feeKind) : null;
  return (
    <span
      className={cn(
        "whitespace-nowrap",
        className,
        label.kind === "fee" ? "font-mono tabular-nums" : cn("font-sans tracking-normal", labelClassName),
        label.kind === "unknown" && "text-ink-mute-2",
      )}
    >
      {label.text}
      {kind !== null && (
        <span className="ml-1 font-sans text-[10px] font-normal tracking-normal text-ink-mute-2">{kind}</span>
      )}
    </span>
  );
}
