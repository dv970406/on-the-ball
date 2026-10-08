// ⚠ `"use client"`가 없다 — 상호작용이 없는 렌더러라 서버 렌더 여지를 남긴다(`architecture.md`)
import { cn } from "@/shared/lib/cn";
import { feeKindLabel } from "../lib/fee";
import type { TransferDeal } from "../model/types";
import { FeeDelta } from "./fee-delta";
import { FeeRangeBar } from "./fee-range-bar";
import { FeeValue } from "./fee-value";

interface FeeHighlightProps {
  deal: TransferDeal;
  /** 큰 금액의 크기·자간 — 자리마다 다르다(상세 히어로가 더 크다) */
  valueClassName?: string;
  className?: string;
}

/**
 * 이적료 강조 블록 — 금액의 성격 · 큰 금액 · 직전 보도 대비 · 보도 범위 바.
 * 넓은 화면의 딜 상세 히어로와 보드의 오른쪽 판(`widgets/deal-panel`)이 같은 블록을 그린다. 좁은 화면의 상세는
 * 계약·주급까지 한 카드에 담은 이적료 카드(`views/transfer-detail`)를 쓴다.
 *
 * - 제목은 금액의 성격이다 — 실제 이적료가 아닌 금액(거절된 제안액·구단의 요구액)을 "이적료"로 부르지 않는다.
 *   금액이 없으면(FA·미공개) 성격도 없다.
 * - 변동폭·범위 바는 금액이 있을 때만 각자 그린다(`FeeDelta`·`FeeRangeBar`가 판정을 갖는다).
 * ⚠ 숫자는 전부 `font-mono tabular-nums` — 부품들이 안에서 그 클래스를 갖는다.
 */
export function FeeHighlight({ deal, valueClassName, className }: FeeHighlightProps) {
  const hasFee = deal.feeAmount !== null;
  return (
    <section aria-label="이적료" className={className}>
      <span className="font-mono text-[10px] uppercase tracking-[0.5px] text-ink-mute-2">
        {feeKindLabel(hasFee ? deal.feeKind : null)}
      </span>
      <FeeValue
        deal={deal}
        caption={false}
        className={cn("mt-1.5 block leading-none text-ink", valueClassName ?? "text-[36px] tracking-[-1.5px]")}
        labelClassName="text-[20px] font-medium"
      />
      {hasFee && <FeeDelta deal={deal} lead className="mt-2 text-[13px]" />}
      <FeeRangeBar deal={deal} className="mt-4" />
    </section>
  );
}
