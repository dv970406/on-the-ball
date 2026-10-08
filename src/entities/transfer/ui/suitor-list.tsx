// ⚠ `"use client"`가 없다 — 상호작용이 없는 렌더러라 서버 렌더 여지를 남긴다(`architecture.md`)
import { cn } from "@/shared/lib/cn";
import { destinationClubs } from "../lib/route-label";
import type { TransferDeal } from "../model/types";
import { TransferCrest } from "./transfer-crest";

interface SuitorListProps {
  deal: Pick<TransferDeal, "toClub" | "suitors">;
  className?: string;
}

/**
 * 관심 구단 — 행선지(있으면 맨 앞) + 관심 구단을 **유력한 순**으로 엠블럼·정식명 한 줄씩.
 * 넓은 화면의 딜 상세 곁 칸과 보드의 오른쪽 판(`widgets/deal-panel`)이 같은 목록을 그린다.
 *
 * ⚠ **비중(%)·막대를 그리지 않는다.** 저장된 것은 순서(`transfer_deal_suitor.position`)뿐이다 — 언급 비중을 지어내면
 *   순서가 수치처럼 읽힌다. 순서만 번호로 말한다.
 * ⚠ 행선지에 "행선지" 꼬리표를 단다 — 확실한 행선지와 관심만 보인 구단이 한 목록에 있어서다(색이 아니라 글자로 가른다).
 */
export function SuitorList({ deal, className }: SuitorListProps) {
  const clubs = destinationClubs(deal);
  if (clubs.length === 0) {
    return <p className={cn("text-[13px] text-ink-mute", className)}>아직 보도된 행선지·관심 구단이 없어요.</p>;
  }
  return (
    <ol className={className}>
      {clubs.map((club, i) => (
        <li
          key={club.code}
          className="flex min-w-0 items-center gap-2.5 border-b border-hairline-cool py-2 last:border-b-0"
        >
          <span className="w-4 shrink-0 font-mono text-[11px] tabular-nums text-ink-mute-2">{i + 1}</span>
          <TransferCrest club={club} size={22} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium tracking-[-0.2px] text-ink">{club.name}</span>
          {deal.toClub !== null && i === 0 && (
            <span className="shrink-0 text-[11px] font-medium text-ink-secondary">행선지</span>
          )}
          {club.league && <span className="shrink-0 text-[11px] text-ink-mute-2">{club.league}</span>}
        </li>
      ))}
    </ol>
  );
}
