// ⚠ `"use client"`가 없다 — 상호작용이 없는 렌더러라 서버 렌더 여지를 남긴다(`architecture.md`)
import { formatFee } from "../lib/fee";
import type { TransferDeal } from "../model/types";

interface FeeRangeBarProps {
  deal: Pick<TransferDeal, "feeAmount" | "feeCurrency" | "feeLowAmount" | "feeHighAmount">;
  className?: string;
}

/**
 * 보도 범위 바 — 같은 통화 보도의 최소–최대(`feeLowAmount`–`feeHighAmount`) 위에 지금 금액의 자리를 찍는다.
 *
 * ⚠ **범위가 없거나 한 값이면 그리지 않는다** — 양 끝이 같은 바는 점 하나라 아무것도 말하지 않는다. 지금 금액이 없을 때도
 *   (FA·미공개) 찍을 자리가 없어 그리지 않는다.
 * ⚠ 표지의 위치는 런타임 비율이라 `style`이다(`styling.md` "계산된 비율"). 바 자체는 데이터 표시라 에메랄드를 쓰지 않는다.
 * ⚠ 화면의 바는 `aria-hidden`이고 같은 내용을 `sr-only` 문장이 진다 — 막대의 위치는 읽히지 않는다.
 */
export function FeeRangeBar({ deal, className }: FeeRangeBarProps) {
  const { feeAmount, feeCurrency, feeLowAmount: low, feeHighAmount: high } = deal;
  if (feeAmount === null || low === null || high === null || !(high > low)) return null;
  // 양 끝·지금 금액 모두 `formatFee` 하나로 — 저장 정밀도 그대로라 서로 다른 금액이 같은 글자가 되지 않는다
  const lowText = formatFee({ amount: low, currency: feeCurrency });
  const highText = formatFee({ amount: high, currency: feeCurrency });
  const nowText = formatFee({ amount: feeAmount, currency: feeCurrency });
  if (lowText === null || highText === null || nowText === null) return null;
  // 지금 금액이 범위 밖일 수는 없지만(파생기가 같은 보도들로 범위를 만든다) 표지가 바 밖으로 나가지 않게 한 번 더 묶는다
  const position = Math.min(100, Math.max(0, ((feeAmount - low) / (high - low)) * 100));

  return (
    <div className={className}>
      <div aria-hidden className="relative h-1.5 rounded-[2px] bg-hairline-cool">
        <span
          className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-[1px] bg-ink"
          style={{ left: `${position}%` }}
        />
      </div>
      <div aria-hidden className="mt-1.5 flex items-baseline justify-between text-[11px] text-ink-mute-2">
        <span className="font-mono tabular-nums">{lowText}</span>
        <span>보도 범위</span>
        <span className="font-mono tabular-nums">{highText}</span>
      </div>
      <p className="sr-only">
        보도 범위 {lowText}부터 {highText}, 지금 {nowText}
      </p>
    </div>
  );
}
