// ⚠ `"use client"`가 없다 — 상호작용이 없는 렌더러라 서버 렌더 여지를 남긴다(`architecture.md`)
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { flagEmoji } from "../lib/flag";
import type { TransferDeal } from "../model/types";

interface DealInfoLineProps {
  deal: Pick<TransferDeal, "player" | "playerKo" | "position" | "birthYear" | "nationality">;
  /**
   * 영문 대문자 이름을 이 줄에 싣는가 — 기본 켬. 영문 이름을 제목 옆에 따로 그리는 자리(넓은 화면의 상세 히어로)만 끈다.
   * ⚠ 켜 두어도 **제목이 한국어일 때만** 싣는다 — 한국어 표기가 없으면 제목이 이미 영문이다.
   */
  englishName?: boolean;
  className?: string;
}

/**
 * 정보줄 — `DAVID ALABA · CB/LB · 1992년생 · 🇦🇹 AUT`. 딜 상세와 보드의 오른쪽 판(`widgets/deal-panel`)이 같은 줄을 그린다.
 *
 * **있는 항목만** ` · `로 잇는다("틀린 칸보다 빈 칸"). 이름 외에 아무것도 없고 제목도 영문이면 이 줄 자체를 그리지 않는다.
 */
export function DealInfoLine({ deal, englishName = true, className }: DealInfoLineProps) {
  const flag = deal.nationality === null ? null : flagEmoji(deal.nationality);
  const items: ReactNode[] = [];
  if (englishName && deal.playerKo !== null) items.push(deal.player.toUpperCase());
  if (deal.position !== null) items.push(deal.position);
  if (deal.birthYear !== null) items.push(`${deal.birthYear}년생`);
  if (deal.nationality !== null) {
    items.push(
      <>
        {flag !== null && (
          // 이모지 폰트 스택을 명시한다 — mono 폰트가 국기 코드포인트를 갖지 않아 폴백이 기기마다 갈린다
          <span
            aria-hidden
            className="mr-1 align-[-1px] font-['Apple_Color_Emoji','Segoe_UI_Emoji','Noto_Color_Emoji',sans-serif] text-[13px] tracking-normal"
          >
            {flag}
          </span>
        )}
        {deal.nationality}
      </>,
    );
  }
  if (items.length === 0) return null;

  return (
    <p className={cn("mt-1.5 font-mono text-[11px] tracking-[0.2px] tabular-nums text-ink-mute", className)}>
      {items.map((item, i) => (
        // 항목 수가 넷 이하의 고정 순서라 인덱스 키가 안정적이다
        <span key={i}>
          {i > 0 && " · "}
          {item}
        </span>
      ))}
    </p>
  );
}
