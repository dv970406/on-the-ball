// ⚠ `"use client"`가 없다 — 상호작용이 없는 렌더러라 서버 렌더 여지를 남긴다(`architecture.md`).
//    그래서 순수 함수는 배럴이 아니라 직접 경로로 가져온다(`credibility-badge.tsx`와 같은 이유).
import { FeeDelta, FeeValue, type TransferDeal, feeKindLabel, formatFee, formatFeeRange } from "@/entities/transfer";
import { cn } from "@/shared/lib/cn";

/** 값이 없는 칸 — 전부 같은 글자(`—`)로 말한다 */
const EMPTY = "—";

/** KV 칸의 라벨 — mono 10 uppercase ink-mute-2 */
const labelClassName = "font-mono text-[10px] uppercase tracking-[0.5px] text-ink-mute-2";

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
 *
 * ⚠ 이 KV의 모든 칸은 **라벨 위 · 값 아래**다. 칸 구분은 헤어라인이고 그림자는 없다.
 * ⚠ 숫자는 전부 `font-mono tabular-nums` — `FeeDelta`는 안에서 그 클래스를 갖는다.
 */
export function FeeCard({ deal, className }: FeeCardProps) {
  const fee = formatFee({ amount: deal.feeAmount, currency: deal.feeCurrency });
  const addOn =
    deal.feeAmount !== null && deal.addOnAmount !== null
      ? {
          add: formatFee({ amount: deal.addOnAmount, currency: deal.feeCurrency }),
          max: formatFee({ amount: deal.feeAmount + deal.addOnAmount, currency: deal.feeCurrency }),
        }
      : null;

  const hasFee = fee !== null;
  // 금액 칸 둘이 빠지면 계약·주급이 첫 줄이 된다 — 선 규칙이 칸 번호로 정해지므로 번호를 당긴다
  const offset = hasFee ? 2 : 0;

  /** 2×2 KV — 짝수 칸은 왼쪽 선, 3·4번째 칸은 위쪽 선 */
  const cell = (index: number) =>
    cn(
      "p-[11px_14px]",
      index % 2 === 1 && "border-l border-hairline-cool",
      index >= 2 && "border-t border-hairline-cool",
    );

  return (
    <section
      aria-label="이적료"
      className={cn("mt-3 overflow-hidden rounded-lg border border-hairline", className)}
    >
      <div className="p-3.5">
        {/* 제목이 금액의 성격을 말한다(제안액·요구액…) — 금액이 없으면(FA·미공개) 성격도 없다 */}
        <span className={labelClassName}>{feeKindLabel(hasFee ? deal.feeKind : null)}</span>
        <FeeValue
          deal={deal}
          caption={false}
          className="mt-2 block text-[36px] leading-none tracking-[-1.5px] text-ink"
          labelClassName="text-[20px] font-medium"
        />
        {fee !== null && (
          <p className="mt-1.5 text-[12px] text-ink-mute">
            {addOn !== null && addOn.add !== null && addOn.max !== null ? (
              <>
                옵션 +<span className="font-mono tabular-nums">{addOn.add}</span> · 최대{" "}
                <span className="font-mono tabular-nums">{addOn.max}</span>
              </>
            ) : (
              "옵션 없음"
            )}
          </p>
        )}
      </div>

      {/*
        ⚠ 이적료가 없으면(FA · 미공개) **금액에 딸린 두 칸(직전 보도 대비 · 보도 범위)을 통째로 뺀다** —
          비교할 금액이 없는 칸은 늘 `—`라 정보가 없다. 남는 계약·주급 두 칸이 한 줄이 된다.
      */}
      <dl className="grid grid-cols-2 border-t border-hairline-cool">
        {hasFee && (
          <>
            <div className={cell(0)}>
              <dt className={labelClassName}>직전 보도 대비</dt>
              {/* 색(상승 primary-deep · 하락 crimson)은 `FeeDelta`가 갖고 방향은 아이콘이 함께 진다 */}
              <dd className="mt-1">
                <FeeDelta deal={deal} className="text-[14px]" />
              </dd>
            </div>
            <div className={cell(1)}>
              <dt className={labelClassName}>보도 범위</dt>
              <dd className="mt-1 font-mono text-[14px] tabular-nums text-ink">
                {formatFeeRange(deal) ?? EMPTY}
              </dd>
            </div>
          </>
        )}
        <div className={cell(offset)}>
          <dt className={labelClassName}>계약</dt>
          <dd className="mt-1 font-mono text-[14px] tabular-nums text-ink">
            {deal.contractText ?? EMPTY}
          </dd>
        </div>
        <div className={cell(offset + 1)}>
          <dt className={labelClassName}>주급</dt>
          <dd className="mt-1 font-mono text-[14px] tabular-nums text-ink">
            {deal.wageText ?? EMPTY}
          </dd>
        </div>
      </dl>
    </section>
  );
}
