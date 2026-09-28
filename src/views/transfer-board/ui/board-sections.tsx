"use client";

import { useState } from "react";
import {
  DealMiniCard,
  DealRow,
  splitHotRumors,
  splitProgress,
  type TransferDealListItem,
  type TransferGroupKey,
  type TransferSort,
} from "@/entities/transfer";
import { cn, formatCount } from "@/shared/lib";
import type { BoardGroup } from "../model/use-transfer-board";
import { groupSectionId } from "./use-group-jump";

/** 미니 카드 가로 트랙으로 그리는 구간 — 나머지는 목록 행(handoff §4-6) */
const CAROUSEL_GROUPS: ReadonlySet<TransferGroupKey> = new Set(["official", "hwg"]);
/** 목록 구간이 한 번에 펼치는 행 수 — "더 보기"마다 이만큼 더 보인다 */
const PAGE = 20;

interface BoardSectionsProps {
  /** 정렬·리그·구단 필터·분류가 끝난 구간 — 빈 구간은 이미 빠져 있다(`groupDeals`) */
  groups: readonly BoardGroup[];
  nowMs: number | null;
  /** 루머 구간의 펼침 순서를 정한다 — 최신순이면 열기 순, 이적료순이면 그 순서 그대로(`splitHotRumors`) */
  sort: TransferSort;
}

/**
 * 보드의 구간들(handoff §4-6 ~ §4-8).
 *
 * 긴 구간은 **접는다, 자르지 않는다.** 행은 전부 HTML에 두고 뒷장은 `hidden`으로 가린 뒤 "더 보기"로 펼친다 —
 * 색인 화면의 본문 SSR·구간 점프·뒤로가기 스크롤 복원이 무한 스크롤이나 서버 페이지네이션 없이 그대로다.
 * - 루머: 식은 루머(7일 무소식)와 열기 하위는 접고 상위 `HOT_RUMORS_DEFAULT`건만 펼친다(`splitHotRumors`).
 * - 진행 중: 합의 임박 / 협상 중 소구간으로 가른다(둘 다 있을 때만 — 하나뿐이면 뱃지가 이미 같은 말을 한다).
 * - 그 밖의 목록 구간: `PAGE`건씩.
 *
 * ⚠ 구간 제목은 **`h2`다** — 행·카드가 선수명을 `h3`로 그리므로(h1 → h2(구간) → h3(선수)) 소구간 캡션은 제목이 아니라 `p`다.
 * ⚠ 첫 구간만 `pt-3.5`, 나머지 `pt-7`. 아래 구분선 없음.
 * ⚠ 목록 행의 디바이더는 `DealRow`가 `[&+&]:before`로 갖는다 — 행이 `ul`의 **직계 형제**여야 하고, 가린 행(`hidden`)도
 *   형제 자리에 남아 선이 끊기지 않는다.
 * ⚠ 펼침 상태는 구간 키별 로컬 state다 — URL에 싣지 않는다(공유할 상태가 아니다). 필터가 바뀌어도 유지된다.
 */
export function BoardSections({ groups, nowMs, sort }: BoardSectionsProps) {
  const [revealed, setRevealed] = useState<Partial<Record<TransferGroupKey, number>>>({});
  const reveal = (key: TransferGroupKey, initial: number) =>
    setRevealed((prev) => ({ ...prev, [key]: (prev[key] ?? initial) + PAGE }));

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
              <span className="font-mono text-[12px] tabular-nums text-ink-mute">{group.deals.length}</span>
            </h2>
            {CAROUSEL_GROUPS.has(group.key) ? (
              <ul className="no-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-px-5 px-5 pb-1 pt-3">
                {group.deals.map((deal) => (
                  <DealMiniCard key={deal.id} deal={deal} nowMs={nowMs} />
                ))}
              </ul>
            ) : (
              <ListGroup
                group={group}
                nowMs={nowMs}
                sort={sort}
                revealed={revealed[group.key]}
                onReveal={(initial) => reveal(group.key, initial)}
              />
            )}
          </section>
        );
      })}
    </>
  );
}

interface ListGroupProps {
  group: BoardGroup;
  nowMs: number | null;
  sort: TransferSort;
  /** 이 구간에서 펼친 행 수 — 아직 안 눌렀으면 undefined(기본값은 구간마다 다르다) */
  revealed: number | undefined;
  onReveal: (initial: number) => void;
}

/** 목록 구간 하나 — 루머는 열기 순 접기, 진행 중은 소구간, 나머지는 페이지 단위 접기 */
function ListGroup({ group, nowMs, sort, revealed, onReveal }: ListGroupProps) {
  if (group.key === "prog") {
    const subgroups = splitProgress(group.deals);
    if (subgroups.length > 1) {
      return (
        <>
          {subgroups.map((sub) => (
            <div key={sub.key}>
              <p className="flex items-baseline gap-1.5 px-5 pb-1 pt-3 text-[12px] font-medium text-ink-mute">
                {sub.label}
                <span className="font-mono text-[11px] tabular-nums text-ink-mute-2">{sub.deals.length}</span>
              </p>
              <ul>
                {sub.deals.map((deal) => (
                  <DealRow key={deal.id} deal={deal} nowMs={nowMs} />
                ))}
              </ul>
            </div>
          ))}
        </>
      );
    }
  }

  // 루머는 식은 것·열기 하위를 접는다. 다른 구간은 앞 PAGE건만 펼친다
  const split = group.key === "rumor" ? splitHotRumors(group.deals, nowMs, sort) : null;
  const ordered: TransferDealListItem[] = split ? [...split.hot, ...split.rest] : group.deals;
  const initial = split ? split.hot.length : PAGE;
  const shown = Math.min(ordered.length, revealed ?? initial);
  const remaining = ordered.length - shown;

  return (
    <>
      <ul>
        {ordered.map((deal, index) => (
          <DealRow key={deal.id} deal={deal} nowMs={nowMs} hidden={index >= shown} />
        ))}
      </ul>
      {remaining > 0 && (
        <div className="px-5 pt-2">
          <button
            type="button"
            onClick={() => onReveal(initial)}
            className="h-11 w-full rounded-sm border border-hairline bg-canvas text-[13px] font-medium text-ink-secondary transition-colors duration-150 ease-otb active:bg-canvas-soft"
          >
            {group.key === "rumor" ? `루머 ${formatCount(remaining)}건 더 보기` : `${formatCount(remaining)}건 더 보기`}
          </button>
        </div>
      )}
    </>
  );
}
