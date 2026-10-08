"use client";

import { useState } from "react";
import {
  DealMiniCard,
  DealRow,
  DealTable,
  DealTableHead,
  type TransferDealListItem,
  type TransferGroupKey,
  type TransferSort,
} from "@/entities/transfer";
import { cn, formatCount } from "@/shared/lib";
import type { GroupLayout } from "../lib/screen-order";
import { groupSectionId } from "./use-group-jump";

/** 미니 카드 가로 트랙으로 그리는 구간(모바일) — md+에서는 이 구간도 표의 행이다 */
const CAROUSEL_GROUPS: ReadonlySet<TransferGroupKey> = new Set(["official", "hwg"]);
/** 목록 구간이 한 번에 펼치는 행 수 — "더 보기"마다 이만큼 더 보인다 */
const PAGE = 20;

interface BoardSectionsProps {
  /**
   * 구간마다의 화면 배치(`groupLayout`) — 정렬·필터·분류가 끝났고 빈 구간은 이미 빠져 있다(`groupDeals`).
   * ⚠ 소구간·열기 순 판정을 여기서 다시 하지 않는다 — 오른쪽 판의 기본 선택이 같은 배치를 본다.
   */
  layouts: readonly GroupLayout[];
  nowMs: number | null;
  /** 표 머리의 정렬 표시 */
  sort: TransferSort;
  /**
   * 접지 않고 전부 펼친다 — **관심 필터가 켜진 보드**가 그 자리다. 접기는 "보드에 무엇이 많은가"를 줄이는 장치인데,
   * 내가 담은 딜은 목록 자체가 내가 고른 것이다: 식은 루머라고 접으면 담아 둔 딜이 한 건도 안 보이는 구간이 생긴다.
   */
  expanded: boolean;
  /** 보도 수 막대의 기준 — 보이는 목록의 최댓값(`DealRow`의 표 열) */
  reportScale: number;
  /** 오른쪽 판에 열린 딜 — 2분할이 서 있을 때만 값이 온다(그 밖에는 `null`) */
  selectedId: number | null;
}

/**
 * 보드의 구간들.
 *
 * 긴 구간은 **접는다, 자르지 않는다.** 행은 전부 HTML에 두고 뒷장은 `hidden`으로 가린 뒤 "더 보기"로 펼친다 —
 * 색인 화면의 본문 SSR·구간 점프·뒤로가기 스크롤 복원이 무한 스크롤이나 서버 페이지네이션 없이 그대로다.
 * - 루머: 식은 루머(7일 무소식)와 열기 하위는 접고 상위 `HOT_RUMORS_DEFAULT`건만 펼친다(`splitHotRumors`).
 * - 진행 중: 합의 임박 / 협상 중 소구간으로 가른다(둘 다 있을 때만 — 하나뿐이면 뱃지가 이미 같은 말을 한다).
 * - 그 밖의 목록 구간(md+ 표의 오피셜·합의 완료 포함): `PAGE`건씩.
 *
 * ⚠ 구간 제목은 **`h2`다** — 행·카드가 선수명을 `h3`로 그리므로(h1 → h2(구간) → h3(선수)) 소구간 캡션은 제목이 아니라 `p`다.
 * ⚠ 첫 구간만 `pt-3.5`, 나머지 `pt-7`. 아래 구분선 없음.
 * ⚠ 목록 행의 디바이더·표 열은 **표의 범위(`DealTable`)가** 건다 — 행이 `ul`의 **직계 형제**여야 하고, 가린 행(`hidden`)도
 *   형제 자리에 남아 선이 끊기지 않는다.
 * ⚠ **md+에서는 표다** — 구간 위에 열 머리 행(`DealTableHead`)이 서고, 구간 제목이 표 안의 구간 머리 행처럼 보이며, 행이
 *   표의 열로 펼쳐진다(`DealRow`). 오피셜·합의 완료의 미니 카드 트랙(모바일)은 md+에서 가리고 **같은 딜을 표 행으로 한 벌 더**
 *   그린다(`md:hidden` 트랙 + `hidden md:block` 행 목록) — 중복 렌더는 이 두 구간뿐이다. 두 벌 다 HTML에 있다.
 *   카드와 행은 모양이 달라 한 요소를 두 폭에 맞출 수 없고, 한 벌만 서버가 그리면 다른 폭의 첫 화면이 비거나 하이드레이션
 *   뒤에 바뀐다. 표의 그 행 목록은 다른 목록 구간과 같은 `PAGE` 접기를 탄다(트랙은 가로 스크롤이라 접지 않는다).
 * ⚠ 펼침 상태는 구간 키별 로컬 state다 — URL에 싣지 않는다(공유할 상태가 아니다). 필터가 바뀌어도 유지된다.
 */
export function BoardSections({ layouts, nowMs, sort, expanded, reportScale, selectedId }: BoardSectionsProps) {
  const [revealed, setRevealed] = useState<Partial<Record<TransferGroupKey, number>>>({});
  const reveal = (key: TransferGroupKey, initial: number) =>
    setRevealed((prev) => ({ ...prev, [key]: (prev[key] ?? initial) + PAGE }));

  return (
    <DealTable>
      <DealTableHead sort={sort} />
      {layouts.map((layout, i) => {
        const { group } = layout;
        const id = groupSectionId(group.key);
        const titleId = `${id}-title`;
        const carousel = CAROUSEL_GROUPS.has(group.key);
        return (
          <section key={group.key} id={id} aria-labelledby={titleId}>
            <h2
              id={titleId}
              className={cn(
                "flex items-baseline gap-1.5 px-5 pb-1.5 text-[15px] font-medium tracking-[-0.3px] text-ink",
                i === 0 ? "pt-3.5" : "pt-7",
                // 표 안의 구간 머리 행
                "md:border-b md:border-hairline-cool md:bg-canvas-soft md:py-2 md:text-[13px]",
                i > 0 && "md:border-t",
              )}
            >
              {group.label}
              <span className="font-mono text-[12px] tabular-nums text-ink-mute">{group.deals.length}</span>
            </h2>
            {carousel && (
              <ul className="no-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-px-5 px-5 pb-1 pt-3 md:hidden">
                {group.deals.map((deal) => (
                  <DealMiniCard key={deal.id} deal={deal} nowMs={nowMs} />
                ))}
              </ul>
            )}
            <ListGroup
              layout={layout}
              nowMs={nowMs}
              expanded={expanded}
              revealed={revealed[group.key]}
              onReveal={(initial) => reveal(group.key, initial)}
              reportScale={reportScale}
              selectedId={selectedId}
              tableOnly={carousel}
            />
          </section>
        );
      })}
    </DealTable>
  );
}

interface ListGroupProps {
  layout: GroupLayout;
  nowMs: number | null;
  /** 접지 않는다(`BoardSectionsProps.expanded`) */
  expanded: boolean;
  /** 이 구간에서 펼친 행 수 — 아직 안 눌렀으면 undefined(기본값은 구간마다 다르다) */
  revealed: number | undefined;
  onReveal: (initial: number) => void;
  reportScale: number;
  selectedId: number | null;
  /** md+ 표에서만 그린다 — 모바일에서는 같은 딜을 미니 카드 트랙이 그린다(오피셜·합의 완료) */
  tableOnly: boolean;
}

/** 목록 구간 하나 — 진행 중은 소구간, 루머는 열기 순 접기, 나머지는 페이지 단위 접기 */
function ListGroup({
  layout,
  nowMs,
  expanded,
  revealed,
  onReveal,
  reportScale,
  selectedId,
  tableOnly,
}: ListGroupProps) {
  const { subgroups, ordered, hotCount } = layout;

  if (subgroups) {
    return (
      <>
        {subgroups.map((sub) => (
          <div key={sub.key}>
            <p className="flex items-baseline gap-1.5 px-5 pb-1 pt-3 text-[12px] font-medium text-ink-mute md:border-b md:border-hairline-cool md:py-1.5">
              {sub.label}
              <span className="font-mono text-[11px] tabular-nums text-ink-mute-2">{sub.deals.length}</span>
            </p>
            <ul>
              {sub.deals.map((deal) => (
                <Row key={deal.id} deal={deal} nowMs={nowMs} reportScale={reportScale} selectedId={selectedId} />
              ))}
            </ul>
          </div>
        ))}
      </>
    );
  }

  // 루머는 식은 것·열기 하위를 접는다. 다른 구간은 앞 PAGE건만 펼친다
  const initial = hotCount ?? PAGE;
  // 순서는 접을 때와 같게 둔다(뜨거운 루머가 앞) — 필터를 켜고 끌 때 같은 딜의 자리가 뒤섞이지 않게
  const shown = expanded ? ordered.length : Math.min(ordered.length, revealed ?? initial);
  const remaining = ordered.length - shown;

  return (
    <>
      <ul className={tableOnly ? "hidden md:block" : undefined}>
        {ordered.map((deal, index) => (
          <Row
            key={deal.id}
            deal={deal}
            nowMs={nowMs}
            hidden={index >= shown}
            reportScale={reportScale}
            selectedId={selectedId}
          />
        ))}
      </ul>
      {remaining > 0 && (
        <div className={cn("px-5 pt-2 md:pb-2", tableOnly && "hidden md:block")}>
          <button
            type="button"
            onClick={() => onReveal(initial)}
            className="h-11 w-full rounded-sm border border-hairline bg-canvas text-[13px] font-medium text-ink-secondary transition-colors duration-150 ease-otb active:bg-canvas-soft"
          >
            {layout.group.key === "rumor" ? `루머 ${formatCount(remaining)}건 더 보기` : `${formatCount(remaining)}건 더 보기`}
          </button>
        </div>
      )}
    </>
  );
}

/** 행 하나 — 고른 딜 판정만 더한다(`DealRow`가 `memo`라 바뀐 행 둘만 다시 그려진다) */
function Row({
  deal,
  nowMs,
  hidden,
  reportScale,
  selectedId,
}: {
  deal: TransferDealListItem;
  nowMs: number | null;
  hidden?: boolean;
  reportScale: number;
  selectedId: number | null;
}) {
  return (
    <DealRow deal={deal} nowMs={nowMs} hidden={hidden} reportScale={reportScale} selected={deal.id === selectedId} />
  );
}
