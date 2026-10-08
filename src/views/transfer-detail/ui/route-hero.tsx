// ⚠ `"use client"`가 없다 — 상호작용이 없는 렌더러라 서버 렌더 여지를 남긴다(`architecture.md`)
import { ArrowRight } from "lucide-react";
import {
  type TransferClub,
  type TransferDeal,
  TransferCrest,
  destinationClubs,
  routeLabels,
} from "@/entities/transfer";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui";

function HeroClub({ label, club, text, note }: { label: string; club: TransferClub | null; text: string; note?: string }) {
  return (
    // 네 줄(라벨 · 엠블럼 · 이름 · 리그)을 부모 그리드의 행에 맞춘다(`subgrid`) — 아래 `RouteHero` 주석
    <div className="row-span-4 grid w-[124px] grid-rows-subgrid justify-items-center text-center">
      <span className="font-mono text-[10px] uppercase tracking-[0.5px] text-ink-mute-2">{label}</span>
      <TransferCrest club={club} size={56} priority className="mt-2" />
      {/* 정식명이 길면 두 줄로 흘린다 — 잘린 구단 이름은 어느 구단인지 알 수 없다 */}
      <span className="mt-2 line-clamp-2 text-[15px] font-semibold leading-[1.3] tracking-[-0.3px] text-ink">{text}</span>
      {note && <span className="mt-0.5 text-[11px] text-ink-mute">{note}</span>}
    </div>
  );
}

/**
 * 넓은 화면의 히어로 경로 — 큰 엠블럼 두 개(FROM → TO). 좁은 화면의 경로 카드(`DealRouteCard`)와 같은 판정을 쓴다
 * (빈 칸 문구는 `routeLabels`, 행선지 자리의 구단은 `destinationClubs`).
 *
 * - 행선지 자리에 구단이 여럿이면 **가장 유력한 하나**만 크게 그리고 "외 N곳"을 단다 — 전부는 곁 칸의 관심 구단 목록이 적는다.
 *   확실한 행선지가 없는 루머라면 라벨이 "TO · 유력"이 된다(첫 구단이 행선지로 읽히지 않게).
 * - 두 칸은 **행을 함께 쓴다**(3열 그리드 + 칸마다 `subgrid`) — 한쪽 정식명만 두 줄로 꺾이면 그 칸의 리그 줄이 한 줄 내려가
 *   FROM과 TO의 높이가 어긋났다. 행을 공유하면 이름 줄의 높이가 긴 쪽에 맞고 리그 줄이 같은 높이에 선다(둘 다 한 줄이면 빈 줄이
 *   생기지 않는다). 화살표는 엠블럼 줄 가운데에 선다.
 */
export function RouteHero({ deal, className }: { deal: TransferDeal; className?: string }) {
  const labels = routeLabels(deal, { full: true });
  const clubs = destinationClubs(deal);
  const first = clubs[0] ?? null;
  const rest = clubs.length - 1;
  return (
    <section
      aria-label="이적 경로"
      className={cn("grid-cols-[124px_auto_124px] grid-rows-[repeat(4,auto)] gap-x-3", className)}
    >
      <HeroClub label="FROM" club={deal.fromClub} text={labels.from} note={deal.fromClub?.league ?? undefined} />
      {/* 엠블럼 줄(둘째 행) 가운데 — 엠블럼과 같은 위 여백(`mt-2`)을 두어 엠블럼 자체의 가운데에 맞춘다 */}
      <span aria-hidden className="col-start-2 row-start-2 mt-2 self-center text-ink-mute-2">
        <Icon as={ArrowRight} size={20} />
      </span>
      <HeroClub
        label={deal.toClub === null && first !== null ? "TO · 유력" : "TO"}
        club={first}
        text={first ? first.name : labels.to}
        note={rest > 0 ? `외 ${rest}곳` : (first?.league ?? undefined)}
      />
    </section>
  );
}
