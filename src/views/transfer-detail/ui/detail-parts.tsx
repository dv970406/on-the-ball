"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  DealInfoLine,
  DealMiniCard,
  DealRouteCard,
  DealStatusLine,
  FeeHighlight,
  type TransferClub,
  type TransferDeal,
  type TransferDealListItem,
  TransferCrest,
  playerName,
} from "@/entities/transfer";
import { ROUTES } from "@/shared/config";
import { cn } from "@/shared/lib";
import { Skeleton, chipClassName } from "@/shared/ui";
import { WIDE_CARD, WIDE_CARD_TITLE } from "./detail-card";
import { FeeCard } from "./fee-card";
import { RouteHero } from "./route-hero";

/** 로딩 골격 — 실제 화면과 같다: 뱃지 줄 · 이름 · 정보줄 · 경로 카드 · 이적료 카드 · 탭 · 입력칸 */
export function DetailSkeleton() {
  return (
    <div aria-hidden className="pt-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="mt-3 h-8 w-3/5" />
      <Skeleton className="mt-2 h-3 w-4/5" />
      <Skeleton className="mt-3 h-[88px] w-full rounded-lg" />
      <Skeleton className="mt-3 h-[196px] w-full rounded-lg" />
      <Skeleton className="mt-7 h-11 w-48" />
      <Skeleton className="mt-3.5 h-11 w-full rounded-md" />
    </div>
  );
}

/** 히어로 — 좁은 화면에서는 카드 없이 흐르고, 넓은 화면에서는 한 카드에 세 칸(이름 | 경로 | 이적료) */
export function DealHero({ deal, nowMs }: { deal: TransferDeal; nowMs: number | null }) {
  return (
    <div className="lg:col-span-2 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(260px,320px)] lg:items-center lg:gap-10 lg:rounded-xl lg:border lg:border-hairline lg:bg-canvas lg:p-8">
      <header>
        {/* 넓은 화면에서는 뱃지 옆에 붙는다. 보도 수는 넓은 화면에서만 — 좁은 화면은 보도 타임라인 탭이 건수를 갖는다 */}
        <DealStatusLine deal={deal} nowMs={nowMs} updateClassName="lg:ml-1" countClassName="hidden lg:inline" />

        <div className="lg:mt-3 lg:flex lg:flex-wrap lg:items-baseline lg:gap-x-3">
          {/* 한국어 표기는 운영 사전에 있을 때만 — 없으면 영문명이 곧 제목이다 */}
          <h1 className="mt-3 text-pretty text-[28px] font-medium leading-[1.15] tracking-[-1px] text-ink lg:mt-0 lg:text-[40px] lg:font-semibold lg:tracking-[-1.5px]">
            {playerName(deal)}
          </h1>
          {/* 넓은 화면은 영문 이름을 제목 옆에 둔다(좁은 화면은 정보줄 맨 앞에 대문자로) */}
          {deal.playerKo !== null && (
            <span lang="en" className="hidden text-[18px] text-ink-mute lg:inline">
              {deal.player}
            </span>
          )}
        </div>
        <DealInfoLine deal={deal} className="lg:hidden" />
        <DealInfoLine deal={deal} englishName={false} className="hidden lg:mt-2 lg:block lg:text-[13px]" />
      </header>

      {/* 경로 — 좁은 화면은 3열 카드, 넓은 화면은 큰 엠블럼 두 개 */}
      <DealRouteCard deal={deal} className="mt-3 lg:hidden" />
      <RouteHero deal={deal} className="hidden lg:grid" />

      {/* 이적료 — 좁은 화면은 계약·주급까지 담은 카드, 넓은 화면은 금액 블록(계약 조건은 곁 칸으로) */}
      <FeeCard deal={deal} className="lg:hidden" />
      <FeeHighlight
        deal={deal}
        valueClassName="text-[44px] tracking-[-2px]"
        className="hidden lg:block lg:self-stretch lg:border-l lg:border-hairline-cool lg:pl-10"
      />
    </div>
  );
}

/** 넓은 화면에서 탭 대신 패널을 말하는 제목 — 좁은 화면은 탭이 이름과 건수를 갖는다 */
export function PanelHeading({ count, children }: { count: string | null; children: ReactNode }) {
  return (
    <h2 className={cn("mb-1 hidden lg:block", WIDE_CARD_TITLE)}>
      {children}
      {count !== null && <span className="ml-1.5 font-mono text-[13px] font-normal tabular-nums text-ink-mute-2">{count}</span>}
    </h2>
  );
}

/**
 * 같은 구단의 다른 딜 — 상세가 다른 딜로 가는 **크롤 경로**다(없으면 크롤러가 딜을 찾는 길이 사이트맵뿐이다).
 * 서버가 그린 목록만 쓴다 — 클라이언트에서 다시 받지 않는다(이동 링크라 몇 분 낡아도 거짓이 되지 않는다).
 * 좁은 화면은 보드의 미니 카드 트랙처럼 가로로 흐르고(화면 끝까지), md+는 줄을 바꿔 다 보인다(스크롤바 한 줄을 두지 않는다).
 */
export function RelatedDealsSection({ deals, nowMs }: { deals: TransferDealListItem[] | undefined; nowMs: number | null }) {
  if (!deals || deals.length === 0) return null;
  return (
    <section aria-labelledby="detail-related-heading" className={cn("mt-8 lg:mt-6", WIDE_CARD)}>
      <h2 id="detail-related-heading" className={WIDE_CARD_TITLE}>
        같은 구단의 다른 딜
      </h2>
      <ul className="no-scrollbar -mx-5 mt-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto overflow-y-hidden scroll-px-5 px-5 pb-1 md:mx-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] md:overflow-visible md:px-0 md:[&>li]:w-auto">
        {deals.map((related) => (
          <DealMiniCard key={related.id} deal={related} nowMs={nowMs} />
        ))}
      </ul>
    </section>
  );
}

/**
 * 이 딜에 걸린 구단의 이적시장 — 구단 화면(검색 착지점)으로 가는 길이자 크롤러가 구단 화면을 찾는 길이다.
 * 5대 리그 구단만이다(그 밖은 구단 화면이 없다 — `dealLeagueClubs`). 딜 데이터만으로 그리므로 서버 HTML에 실린다.
 * 프리페치를 끈다 — 구단 화면은 동적 라우트라 뷰포트 프리페치가 받아 오는 것이 없다(`DealRow`와 같은 판단).
 */
export function ClubLinksNav({ clubs }: { clubs: TransferClub[] }) {
  if (clubs.length === 0) return null;
  return (
    <nav aria-labelledby="detail-clubs-heading" className={cn("mt-8 lg:mt-6", WIDE_CARD)}>
      <h2 id="detail-clubs-heading" className={WIDE_CARD_TITLE}>
        구단별 이적시장
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {clubs.map((club) => (
          <li key={club.code}>
            <Link
              href={ROUTES.transferClub(club.code)}
              prefetch={false}
              className={chipClassName(false, "inline-flex items-center gap-1.5 text-ink-secondary")}
            >
              <TransferCrest club={club} size={16} className="shrink-0" />
              {club.shortName} 이적시장
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
