// ⚠ `"use client"`가 없다 — 상호작용이 없는 렌더러라 서버 렌더 여지를 남긴다(`architecture.md`)
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { feeKindLabel, formatFee } from "../lib/fee";
import type { TransferDeal } from "../model/types";

/** 값이 없는 칸 — 전부 같은 글자(`—`)로 말한다 */
const EMPTY = "—";

interface ContractTermsProps {
  deal: TransferDeal;
  className?: string;
}

/**
 * 계약 조건 — 이적료 성격 · 옵션 · 주급 · 계약 · 직전 보도 금액을 한 줄씩(`<dl>`).
 * 넓은 화면의 딜 상세 곁 칸과 보드의 오른쪽 판(`widgets/deal-panel`)이 같은 목록을 그린다.
 *
 * - **금액에 딸린 줄(성격·옵션·직전 보도)은 이적료가 있을 때만** 둔다 — 비교할 금액이 없는 줄은 늘 `—`라 정보가 없다.
 *   "옵션 없음"도 이적료가 있을 때만 뜻이 있다(이적료 카드와 같은 판단).
 * - **직전 보도는 금액만이다.** 그 보도의 시각은 딜에 없다(`prev_fee_amount`만 저장된다) — 지어내지 않는다.
 * - 주급·계약은 원문 표기 그대로다(원화 환산은 하지 않는다 — 하드코딩 환율은 거짓 숫자다).
 */
export function ContractTerms({ deal, className }: ContractTermsProps) {
  const fee = (amount: number | null) => formatFee({ amount, currency: deal.feeCurrency });
  const rows: { label: string; value: ReactNode }[] = [];
  if (deal.feeAmount !== null) {
    rows.push({ label: "이적료 성격", value: <span className="font-sans">{feeKindLabel(deal.feeKind)}</span> });
    const add = fee(deal.addOnAmount);
    const max = deal.addOnAmount === null ? null : fee(deal.feeAmount + deal.addOnAmount);
    rows.push({
      label: "옵션",
      value: add !== null && max !== null ? `+${add} · 최대 ${max}` : <span className="font-sans">없음</span>,
    });
  }
  rows.push({ label: "주급", value: deal.wageText ?? EMPTY });
  rows.push({ label: "계약", value: deal.contractText ?? EMPTY });
  if (deal.feeAmount !== null) rows.push({ label: "직전 보도", value: fee(deal.prevFeeAmount) ?? EMPTY });

  return (
    <dl className={cn("text-[13px]", className)}>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-4 border-b border-hairline-cool py-2.5 last:border-b-0"
        >
          <dt className="shrink-0 text-ink-mute">{row.label}</dt>
          <dd className="min-w-0 text-right font-mono tabular-nums text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
