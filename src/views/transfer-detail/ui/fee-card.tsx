// ⚠ `"use client"`가 없다 — 상호작용이 없는 렌더러라 지시어를 달 이유가 없다. 지금 소비자는 클라이언트 뷰라 배럴로 가져온다.
import type { ReactNode } from "react";
import {
  FeeDelta,
  FeeValue,
  type TransferDeal,
  addOnTerms,
  clauseNote,
  feeDelta,
  feeKindLabel,
  formatFee,
  formatFeeRange,
} from "@/entities/transfer";
import { cn } from "@/shared/lib/cn";

interface FeeCardProps {
  deal: TransferDeal;
  className?: string;
}

/**
 * 이적료 카드 — 큰 값 + 옵션 부제 + 2×2 KV.
 *
 * - **원화 환산은 없다**(하드코딩 환율은 거짓 숫자다). 주급은 원문 표기 그대로다.
 * - 결렬 딜도 값은 그대로 그린다 — 뱃지만 결렬이다.
 * - 제목은 금액의 성격이다 — 실제 이적료가 아닌 금액(거절된 제안액·구단의 요구액)을 "이적료"로 부르지 않는다.
 * - 이적료 자체가 없으면 부제를 그리지 않는다 — "옵션 없음"은 이적료가 있을 때만 뜻이 있다.
 * - 대표 금액이 임대의 **완전 이적 조항 금액**이면 부제가 그 조건이다("조건이 맞으면 완전 이적" — `clauseNote`) — 지금 오간 금액이
 *   아니라는 것을 금액 바로 아래에서 말한다. 임대료가 따로 있으면 함께 적는다.
 *
 * ⚠ 이 KV의 모든 칸은 **라벨 위 · 값 아래**다. 칸 구분은 헤어라인이고 그림자는 없다.
 * ⚠ **값이 있는 칸만 둔다** — 직전 보도 대비(변동이 있을 때) · 보도 범위 · 계약 · 주급. `—`만 든 칸은 정보가 없는데 자리를 차지했다
 *   (계약·주급은 대부분의 딜에 없다). 칸이 홀수면 마지막 칸이 두 칸 폭을 쓰고, 하나도 없으면 KV 자체가 없다(계약 조건 목록 `ContractTerms`와 같은 판단).
 * ⚠ 숫자는 전부 `font-mono tabular-nums` — `FeeDelta`는 안에서 그 클래스를 갖는다.
 */
export function FeeCard({ deal, className }: FeeCardProps) {
  const fee = formatFee({ amount: deal.feeAmount, currency: deal.feeCurrency });
  const addOn = addOnTerms(deal);

  const hasFee = fee !== null;
  const condition = hasFee ? clauseNote(deal) : null;
  const range = hasFee ? formatFeeRange(deal) : null;

  /** 2열 KV의 칸 — 값이 있는 것만 */
  const cells: { label: string; value: ReactNode }[] = [];
  // 색(상승 primary-deep · 하락 crimson)은 `FeeDelta`가 갖고 방향은 아이콘이 함께 진다
  if (hasFee && feeDelta(deal) !== null) cells.push({ label: "직전 보도 대비", value: <FeeDelta deal={deal} className="text-[14px]" /> });
  if (range !== null) cells.push({ label: "보도 범위", value: range });
  if (deal.contractText !== null) cells.push({ label: "계약", value: deal.contractText });
  if (deal.wageText !== null) cells.push({ label: "주급", value: deal.wageText });

  return (
    <section
      aria-label="이적료"
      className={cn("mt-3 overflow-hidden rounded-lg border border-hairline", className)}
    >
      <div className="p-3.5">
        {/* 제목이 금액의 성격을 말한다(제안액·요구액…) — 금액이 없으면(FA·미공개) 성격도 없다 */}
        <span className="label-mono">{feeKindLabel(hasFee ? deal.feeKind : null, deal.loanClause)}</span>
        <FeeValue
          deal={deal}
          caption={false}
          className="mt-2 block text-[36px] leading-none tracking-[-1.5px] text-ink"
          labelClassName="text-[20px] font-medium"
        />
        {condition !== null && (
          <p className="mt-1.5 text-[12px] text-ink-mute">
            {condition}
            {deal.loanFeeText !== null && (
              <>
                {" · 임대료 "}
                <span className="font-mono tabular-nums">{deal.loanFeeText}</span>
              </>
            )}
          </p>
        )}
        {/* 조항 문구가 있으면 조항이 말한다 — 옵션 줄의 판정은 `addOnTerms` 하나다 */}
        {addOn !== null && (
          <p className="mt-1.5 text-[12px] text-ink-mute">
            {addOn === "none" ? (
              "옵션 없음"
            ) : (
              <>
                옵션 +<span className="font-mono tabular-nums">{addOn.add}</span> · 최대{" "}
                <span className="font-mono tabular-nums">{addOn.max}</span>
              </>
            )}
          </p>
        )}
      </div>

      {/* 짝수 칸은 왼쪽 선, 셋째 칸부터는 위쪽 선 — 칸이 홀수면 마지막 칸이 줄 전체를 쓴다 */}
      {cells.length > 0 && (
        <dl className="grid grid-cols-2 border-t border-hairline-cool">
          {cells.map((cell, index) => (
            <div
              key={cell.label}
              className={cn(
                "p-[11px_14px]",
                index % 2 === 1 && "border-l border-hairline-cool",
                index >= 2 && "border-t border-hairline-cool",
                index === cells.length - 1 && index % 2 === 0 && "col-span-2",
              )}
            >
              <dt className="label-mono">{cell.label}</dt>
              <dd className="mt-1 font-mono text-[14px] tabular-nums text-ink">{cell.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
