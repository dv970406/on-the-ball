import type { Database } from "@/types/database.types";
import type { TransferDeal } from "../model/types";

type TransferFeeKind = Database["public"]["Enums"]["transfer_fee_kind"];

/**
 * 금액의 성격 라벨 — 보도가 말하는 금액은 대부분 실제 이적료가 아니다(거절된 제안액, 구단이 부르는 요구액, 매체의 평가액).
 * 전부 "이적료"로 그리면 "£86M에 이적"으로 읽힌다 — 성격을 함께 그린다. `Record`라 enum 값이 늘면 컴파일이 누락을 잡는다.
 */
const FEE_KIND_LABEL: Record<TransferFeeKind, string> = {
  fee: "이적료",
  bid: "제안액",
  asking_price: "요구액",
  release_clause: "바이아웃",
  valuation: "평가액",
};

/** 성격을 모르는 금액(규칙이 읽은 것)의 라벨 */
export const UNKNOWN_FEE_KIND_LABEL = "추정 이적료";

/** 금액 칸의 제목 — 성격을 알면 그 라벨, 모르면 "추정 이적료" */
export function feeKindLabel(kind: TransferDeal["feeKind"]): string {
  return kind === null ? UNKNOWN_FEE_KIND_LABEL : FEE_KIND_LABEL[kind];
}

/**
 * 금액 옆에 붙이는 짧은 표시 — **실제 이적료가 아닐 때만**(제안액·요구액·바이아웃·평가액). 이적료와 성격 미상은 금액만 그린다
 * (목록의 모든 금액에 "이적료"를 붙이면 소음이다).
 */
export function feeKindCaption(kind: TransferDeal["feeKind"]): string | null {
  return kind === null || kind === "fee" ? null : FEE_KIND_LABEL[kind];
}

/**
 * 통화 코드 → 기호. DB CHECK가 세 값만 허용한다(마이그레이션 20260924000001) — 모르는 코드가
 * 오면 코드를 그대로 앞에 붙인다(빈 칸보다 낫고, 거짓 기호보다 낫다).
 */
const CURRENCY_SYMBOL: Record<string, string> = { EUR: "€", GBP: "£", USD: "$" };

/** `95` → `"95"`, `12.5` → `"12.5"`, `12.25` → `"12.3"` — 정수는 소수 없이, 아니면 소수 1자리 */
function formatMillions(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}

/**
 * 이적료 표기 — `€95M` / `£12.5M`. 금액 단위는 **백만**이다(`fee_amount`가 그렇게 저장된다).
 * ⚠ 둘 중 하나라도 없으면 `null` — 화면이 `—`를 그린다. DB CHECK가 둘을 묶지만 타입은 각각
 *   nullable이라 여기서 한 번 더 접는다.
 */
export function formatFee({
  amount,
  currency,
}: {
  amount: number | null;
  currency: string | null;
}): string | null {
  if (amount === null || currency === null) return null;
  return `${CURRENCY_SYMBOL[currency] ?? `${currency} `}${formatMillions(amount)}M`;
}

/**
 * 이적료 칸에 그릴 것 — 금액 · 자유계약 · 미공개 셋 중 하나.
 * ⚠ **빈 이적료를 FA로 추정하지 않는다.** 금액이 없는 딜은 대부분 보도에 금액이 없거나 추출하지
 *   못한 것이라, FA는 파생기가 문장에서 자유계약을 확인한 딜(`isFreeAgent`)에만 붙인다.
 *   "틀린 칸보다 빈 칸"(`api-and-db.md`) — 나머지는 "미공개"다.
 */
export type FeeLabel =
  | { kind: "fee"; text: string }
  | { kind: "free"; text: string }
  | { kind: "unknown"; text: string };

export const FREE_AGENT_LABEL = "FA(자유 계약)";
export const UNDISCLOSED_FEE_LABEL = "미공개";

export function feeLabel(
  deal: Pick<TransferDeal, "feeAmount" | "feeCurrency" | "isFreeAgent">,
): FeeLabel {
  const fee = formatFee({ amount: deal.feeAmount, currency: deal.feeCurrency });
  if (fee !== null) return { kind: "fee", text: fee };
  if (deal.isFreeAgent) return { kind: "free", text: FREE_AGENT_LABEL };
  return { kind: "unknown", text: UNDISCLOSED_FEE_LABEL };
}

export interface FeeDeltaValue {
  direction: "up" | "down";
  /** `€10M` — 절댓값. 부호는 아이콘(`ArrowUp`/`ArrowDown`)이 진다 */
  text: string;
}

/**
 * 직전 보도 대비 변동폭. 직전 보도가 없거나(`prevFeeAmount` null) 같은 금액이면 `null`(화면 `—`).
 * ⚠ 파생기가 `prev_fee_amount`에 **같은 통화의 다른 금액**만 넣으므로 통화 변환은 없다.
 */
export function feeDelta(
  deal: Pick<TransferDeal, "feeAmount" | "prevFeeAmount" | "feeCurrency">,
): FeeDeltaValue | null {
  if (deal.feeAmount === null || deal.prevFeeAmount === null) return null;
  const diff = deal.feeAmount - deal.prevFeeAmount;
  if (diff === 0) return null;
  const text = formatFee({ amount: Math.abs(diff), currency: deal.feeCurrency });
  if (text === null) return null;
  return { direction: diff > 0 ? "up" : "down", text };
}

/**
 * 보도 범위 — 그 딜의 보도 이적료 최소–최대(`€58–95M`). 같으면 한 값(`€95M`), 없으면 `null`.
 * ⚠ `min(prev,fee)–(fee+add)` 공식을 쓰지 않는다 — 하락 딜에서 `€58–58M`로 퇴화한다.
 *   파생기가 같은 통화 보도의 min/max를 저장한다.
 */
export function formatFeeRange(
  deal: Pick<TransferDeal, "feeLowAmount" | "feeHighAmount" | "feeCurrency">,
): string | null {
  const { feeLowAmount: low, feeHighAmount: high, feeCurrency: currency } = deal;
  if (low === null || high === null || currency === null) return null;
  if (low === high) return formatFee({ amount: low, currency });
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  return `${symbol}${formatMillions(low)}–${formatMillions(high)}M`;
}
