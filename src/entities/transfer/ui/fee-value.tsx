// ⚠ 배럴이 아니라 직접 경로다 — `"use client"`가 없어 서버 렌더 여지를 남긴다(`fee-delta.tsx`와 같은 이유)
import { cn } from "@/shared/lib/cn";
import { feeLabel } from "../lib/fee";
import type { TransferDeal } from "../model/types";

interface FeeValueProps {
  deal: Pick<TransferDeal, "feeAmount" | "feeCurrency" | "isFreeAgent">;
  /** 크기·자간·색·취소선 등 — 호출부의 칸이 정한다(금액 기준) */
  className?: string;
  /**
   * 금액이 **아닐 때**(FA · 미공개)의 글자 크기 — 기본 13px.
   * ⚠ 금액 크기를 그대로 물려받으면 `FA(자유 계약)`처럼 긴 한글 라벨이 금액 자리에서 두드러진다 —
   *   숫자 칸의 크기는 숫자를 위한 것이라 라벨은 한 단계 작게 그린다.
   */
  labelClassName?: string;
}

/**
 * 이적료 칸의 값 — 금액이면 `€95M`, 자유계약이 확인됐으면 `FA(자유 계약)`, 아니면 `미공개`.
 *
 * ⚠ **숫자만 mono + `tabular-nums`다.** 한글 라벨에 mono를 걸면 서브셋에 없는 글자가 대체 폰트로
 *   떨어져 자간이 들쭉날쭉해진다(JetBrains Mono 서브셋은 라틴·숫자·부호뿐 — `src/app/fonts/README.md`).
 * ⚠ `미공개`는 한 단계 흐리게 그린다 — 값이 아니라 "모름"이라 금액·FA와 같은 무게로 읽히면 안 된다.
 */
export function FeeValue({ deal, className, labelClassName = "text-[13px]" }: FeeValueProps) {
  const label = feeLabel(deal);
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
    </span>
  );
}
