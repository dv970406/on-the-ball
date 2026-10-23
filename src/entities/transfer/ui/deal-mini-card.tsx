"use client";

// `memo`(훅)를 쓰는 조각이라 서버에서 렌더되지 않는다 → 지시어를 달고 `@/shared/lib`도 배럴로 가져온다(`architecture.md`).
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import { ROUTES } from "@/shared/config";
import { formatRelativeTime } from "@/shared/lib";
import { Icon } from "@/shared/ui";
import { loanNote } from "../lib/deal-form";
import { destinationClubs, routeLabels } from "../lib/route-label";
import type { TransferDealListItem } from "../model/types";
import { DealFormMark } from "./deal-form-mark";
import { FeeDelta } from "./fee-delta";
import { FeeValue } from "./fee-value";
import { TransferCrest } from "./transfer-crest";
import { WatchMark } from "./watch-mark";
import { playerName } from "../lib/player-name";

interface DealMiniCardProps {
  deal: TransferDealListItem;
  /** 기준 시각 — `serverNowMs ?? useNowMs()`는 뷰가 한다(`DealRow`와 같은 계약) */
  nowMs: number | null;
}

/**
 * 오피셜·합의 완료 구간의 200px 미니 카드. 가로 스냅 트랙의 항목이라 `li` + `Link`.
 *
 * ⚠ **관심 표시를 이름 앞에 그린다** — 목록 행에만 두면 관심 딜이 오피셜이 되어 미니 카드로
 *   옮겨 가는 순간 보드 어디에도 표시가 안 되는 구멍이 생긴다.
 * ⚠ **임대** — 형태 표지(`DealFormMark`)를 경로 줄 앞에, 선수가 다른 구단에 임대 중이면 그 아래 "○○ 임대 중"을 둔다(`ClubRoute`와 같은 판단 —
 *   이 카드는 경로를 글자로 그려 `ClubRoute`를 쓰지 않는다).
 * ⚠ 그림자 없음 — press는 `active:bg-canvas-soft`(카드 press `shadow-2`는 규약으로 대체).
 * ⚠ 링크의 `data-deal-id`는 lg+에서 보드가 클릭을 가로채 오른쪽 판에 여는 표지다(`DealRow`와 같다).
 *   md+에서는 보드가 이 카드 대신 같은 딜을 표의 행(`DealRow`)으로 그린다.
 * ⚠ 트랙의 `snap-start`·너비는 여기가 갖는다 — 트랙(뷰)은 `flex gap-2.5 overflow-x-auto snap-x`만.
 * ⚠ `memo`·`prefetch={false}` — 사유는 `DealRow`와 같다(행을 고를 때마다 보드가 다시 그려진다 · 동적 상세의 뷰포트 프리페치는
 *   받아 오는 것이 거의 없고 2분할 폭에서는 클릭이 선택으로 가로채진다).
 */
export const DealMiniCard = memo(function DealMiniCard({ deal, nowMs }: DealMiniCardProps) {
  const name = playerName(deal);
  const route = routeLabels(deal);
  const note = loanNote(deal);

  return (
    <li className="w-[200px] shrink-0 snap-start">
      <Link
        href={ROUTES.transfer(deal.id)}
        prefetch={false}
        data-deal-id={deal.id}
        className="block rounded-lg border border-hairline bg-canvas px-3.5 py-3 transition-colors duration-150 ease-otb active:bg-canvas-soft"
      >
        <div className="flex items-center gap-1.5">
          <TransferCrest club={deal.fromClub} size={28} />
          <Icon as={ArrowRight} size={14} className="shrink-0 text-ink-faint" />
          <TransferCrest club={destinationClubs(deal)[0] ?? null} size={28} />
          <time
            dateTime={deal.latestReportedAt}
            className="ml-auto whitespace-nowrap font-mono text-[10px] tabular-nums text-ink-mute"
          >
            {formatRelativeTime(deal.latestReportedAt, nowMs)}
          </time>
        </div>

        <h3 className="mt-3 flex items-center gap-[5px] text-[16px] font-medium leading-[1.3] tracking-[-0.4px] text-ink">
          {deal.isWatched && <WatchMark />}
          <span className="truncate">{name}</span>
        </h3>
        <p className="mt-[3px] flex min-w-0 items-center gap-1.5 text-[12px] text-ink-mute">
          <DealFormMark deal={deal} />
          <span className="min-w-0 truncate">
            {route.from}
            {/* 문장 안의 `→`는 허용된다(아이콘 대체가 아니라 텍스트다) */}
            {" → "}
            <span className="font-medium text-ink">{route.to}</span>
          </span>
        </p>
        {note && <p className="mt-0.5 truncate text-[11px] text-ink-mute">{note}</p>}

        <div className="mt-2.5 flex flex-wrap items-baseline gap-1.5 border-t border-hairline-cool pt-2.5">
          <FeeValue deal={deal} className="text-[16px] leading-none tracking-[-0.5px] text-ink" />
          <FeeDelta deal={deal} lead className="ml-auto" />
        </div>
      </Link>
    </li>
  );
});
