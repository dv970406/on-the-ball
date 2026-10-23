// ⚠ `"use client"`가 없다 — 상호작용이 없는 렌더러라 서버 렌더 여지를 남긴다(`architecture.md`)
import { cn } from "@/shared/lib/cn";
import { dealFormMark } from "../lib/deal-form";
import type { TransferDeal } from "../model/types";

interface DealFormMarkProps {
  /** 표지를 정할 값 — 읽는 법 시트처럼 실제 딜이 아닌 자리는 형태·조항만 넘긴다 */
  deal: Pick<TransferDeal, "form" | "loanClause">;
  className?: string;
}

/**
 * 딜 형태 표지 — `임대` · `임대·의무` · `완전 영입` · `조기 복귀` · `임대 연장`. 완전 이적·모름이면 그리지 않는다.
 *
 * ⚠ **상태 뱃지와 다른 축이다**(진전 ↔ 형태) — 뱃지는 알약(`rounded-full`)이고 이 표지는 6px 사각형 테두리라 모양으로 갈린다.
 *   잉크 그레이 래더만 쓴다(에메랄드 자리 표·알약 예외 표를 늘리지 않는다). 글자가 뜻을 진다(색이 정보를 혼자 지지 않는다).
 * ⚠ 표지 글자는 줄인 말이라 `aria-hidden`이고, 스크린리더에는 풀어 쓴 형태(`label` — "완전 이적 의무부 임대")를 준다.
 */
export function DealFormMark({ deal, className }: DealFormMarkProps) {
  const mark = dealFormMark(deal);
  if (!mark) return null;
  return (
    <span
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center whitespace-nowrap rounded-sm border border-hairline-strong px-1 text-[11px] font-medium leading-none text-ink-secondary",
        className,
      )}
    >
      <span aria-hidden>{mark.mark}</span>
      <span className="sr-only">{mark.label}</span>
    </span>
  );
}
