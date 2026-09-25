"use client";

import { DealMiniCard, DealRow, type TransferGroupKey } from "@/entities/transfer";
import { cn } from "@/shared/lib";
import type { BoardGroup } from "../model/use-transfer-board";
import { groupSectionId } from "./use-group-jump";

/** 미니 카드 가로 트랙으로 그리는 구간 — 나머지는 목록 행(handoff §4-6) */
const CAROUSEL_GROUPS: ReadonlySet<TransferGroupKey> = new Set(["official", "hwg"]);

interface BoardSectionsProps {
  /** 정렬·리그 필터·분류가 끝난 구간 — 빈 구간은 이미 빠져 있다(`groupDeals`) */
  groups: readonly BoardGroup[];
  nowMs: number | null;
}

/**
 * 보드의 구간들(handoff §4-6 ~ §4-8).
 *
 * ⚠ 구간 제목은 **`h2`다** — handoff는 h3지만, 행·카드가 이미 선수명을 `h3`로 그리므로
 *   (`DealRow` 주석: h1(sr-only) → h2(구간) → h3(선수)) 제목이 h3면 항목과 같은 층이 된다.
 * ⚠ 첫 구간만 `pt-3.5`, 나머지 `pt-7`(문서 쪽 — 프로토타입은 CSS 버그로 28). 아래 구분선 없음.
 * ⚠ 목록 행의 디바이더는 `DealRow`가 `[&+&]:before`로 갖는다 — 그래서 행이 `ul`의 **직계
 *   형제**여야 한다(사이에 다른 요소를 끼우면 선이 사라진다).
 * ⚠ 트랙의 카드 폭·스냅 정렬은 카드가 갖는다 — 트랙은 간격·스크롤·스냅 타입만.
 */
export function BoardSections({ groups, nowMs }: BoardSectionsProps) {
  return (
    <>
      {groups.map((group, i) => {
        const id = groupSectionId(group.key);
        const titleId = `${id}-title`;
        return (
          <section key={group.key} id={id} aria-labelledby={titleId}>
            <h2
              id={titleId}
              className={cn(
                "flex items-baseline gap-1.5 px-5 pb-1.5 text-[15px] font-medium tracking-[-0.3px] text-ink",
                i === 0 ? "pt-3.5" : "pt-7",
              )}
            >
              {group.label}
              <span className="font-mono text-[12px] tabular-nums text-ink-mute">
                {group.deals.length}
              </span>
            </h2>
            {CAROUSEL_GROUPS.has(group.key) ? (
              <ul className="no-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-px-5 px-5 pb-1 pt-3">
                {group.deals.map((deal) => (
                  <DealMiniCard key={deal.id} deal={deal} nowMs={nowMs} />
                ))}
              </ul>
            ) : (
              <ul>
                {group.deals.map((deal) => (
                  <DealRow key={deal.id} deal={deal} nowMs={nowMs} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
