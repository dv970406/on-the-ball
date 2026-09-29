"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ROUTES } from "@/shared/config";
import { formatRelativeTime } from "@/shared/lib";
import { Icon } from "@/shared/ui";
import { destinationClubs, routeLabels } from "../lib/route-label";
import type { TransferDealListItem } from "../model/types";
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
 * ⚠ 그림자 없음 — press는 `active:bg-canvas-soft`(카드 press `shadow-2`는 규약으로 대체).
 * ⚠ 트랙의 `snap-start`·너비는 여기가 갖는다 — 트랙(뷰)은 `flex gap-2.5 overflow-x-auto snap-x`만.
 */
export function DealMiniCard({ deal, nowMs }: DealMiniCardProps) {
  const name = playerName(deal);
  const route = routeLabels(deal);

  return (
    <li className="w-[200px] shrink-0 snap-start">
      <Link
        href={ROUTES.transfer(deal.id)}
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
        <p className="mt-[3px] truncate text-[12px] text-ink-mute">
          {route.from}
          {/* 문장 안의 `→`는 허용된다(아이콘 대체가 아니라 텍스트다) */}
          {" → "}
          <span className="font-medium text-ink">{route.to}</span>
        </p>

        <div className="mt-2.5 flex flex-wrap items-baseline gap-1.5 border-t border-hairline-cool pt-2.5">
          <FeeValue deal={deal} className="text-[16px] leading-none tracking-[-0.5px] text-ink" />
          <FeeDelta deal={deal} lead className="ml-auto" />
        </div>
      </Link>
    </li>
  );
}
