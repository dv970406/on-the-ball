// ⚠ `"use client"`가 없다 — 상호작용이 없는 렌더러라 서버 렌더 여지를 남긴다(`architecture.md`)
import { ArrowRight } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui";
import { destinationClubs, routeLabels } from "../lib/route-label";
import type { TransferClub, TransferDeal } from "../model/types";
import { TransferCrest } from "./transfer-crest";

/** 경로 카드의 한 칸 — `FROM`/`TO` 라벨 · 엠블럼 24 + 정식명 · 리그 */
function RouteCell({
  label,
  club,
  text,
  clubs,
  className,
}: {
  label: string;
  club: TransferClub | null;
  /** 칸에 쓸 글자 — 구단이 없을 때의 문구(`FA`·`미확인`·`미정`)까지 `routeLabels`가 정한다. 구단이 여럿이면 쓰지 않는다(아래) */
  text: string;
  /** 행선지 칸의 구단들 — 둘 이상이면 한 줄에 하나씩 전부 적는다(여러 구단이 노리는 루머) */
  clubs?: TransferClub[];
  className?: string;
}) {
  const listed = clubs && clubs.length > 1 ? clubs : null;
  return (
    <div className={cn("min-w-0 p-[12px_14px]", className)}>
      <span className="font-mono text-[10px] uppercase tracking-[0.5px] text-ink-mute-2">
        {label}
      </span>
      {listed ? (
        // 여러 구단이 노리는 루머 — 목록·카드는 `routeLabels`가 `외 N`으로 접지만 이 카드는 폭을 이름에 전부 내줄 수 있는
        // 자리라 **전부** 적는다. 다만 `·`로 이어 흘리면 어디서 한 구단이 끝나는지 읽기 어렵고 겹친 엠블럼이 그 덩어리
        // 가운데 떠 FROM 칸과 줄이 어긋났다 → 한 줄에 엠블럼 하나 + 이름 하나. 첫 줄이 FROM 칸의 구단 줄과 같은 높이에 놓인다.
        // ⚠ 리그 줄을 두지 않는다 — 구단마다 리그가 다를 수 있어 첫 구단의 리그만 적으면 나머지도 그 리그인 것처럼 읽힌다.
        <ul className="mt-2 flex flex-col gap-1.5">
          {listed.map((c) => (
            <li
              key={c.code}
              className="flex min-w-0 items-center gap-2 text-[14px] font-medium leading-[1.3] tracking-[-0.3px] text-ink"
            >
              <TransferCrest club={c} size={24} priority className="shrink-0" />
              {/* 정식명이 좁은 칸에서 한 줄을 넘으면 자르지 않고 두 줄로 흘린다 — 잘린 구단 이름은 어느 구단인지 알 수 없다 */}
              <span className="line-clamp-2">{c.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-2 text-[14px] font-medium leading-[1.3] tracking-[-0.3px] text-ink">
            <TransferCrest club={club} size={24} priority className="shrink-0" />
            {/* 경로 카드는 정식명이다 — 목록 행·칩은 약칭(`TransferClub` 주석) */}
            <span className="truncate">{text}</span>
          </div>
          {/* 5대 리그 밖은 `null`이라 줄을 비운다 — 모르는 리그명을 지어내지 않는다 */}
          {club?.league && <div className="mt-1 text-[11px] text-ink-mute">{club.league}</div>}
        </>
      )}
    </div>
  );
}

interface DealRouteCardProps {
  deal: Pick<TransferDeal, "fromClub" | "toClub" | "isFreeAgent" | "suitors">;
  className?: string;
}

/**
 * 경로 카드 — 3열 `1fr 32px 1fr`, To 칸만 canvas-soft, 가운데 칸 좌우 헤어라인.
 * 딜 상세(좁은 화면)와 보드의 오른쪽 판(`widgets/deal-panel`)이 같은 카드를 그린다.
 */
export function DealRouteCard({ deal, className }: DealRouteCardProps) {
  const labels = routeLabels(deal, { full: true });
  const destinations = destinationClubs(deal);
  return (
    <section
      aria-label="이적 경로"
      className={cn("grid grid-cols-[1fr_32px_1fr] overflow-hidden rounded-lg border border-hairline", className)}
    >
      <RouteCell label="FROM" club={deal.fromClub} text={labels.from} />
      <div aria-hidden className="flex items-center justify-center border-x border-hairline text-ink">
        <Icon as={ArrowRight} size={16} />
      </div>
      <RouteCell
        label="TO"
        club={destinations[0] ?? null}
        clubs={destinations}
        text={labels.to}
        className="bg-canvas-soft"
      />
    </section>
  );
}
