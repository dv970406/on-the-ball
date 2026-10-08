// ⚠ `"use client"`가 없다 — 상호작용이 없는 렌더러라 서버 렌더 여지를 남긴다(`architecture.md`).
//    그래서 순수 함수는 배럴이 아니라 직접 경로로 가져온다(`credibility-badge.tsx`와 같은 이유).
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import { ROUTES } from "@/shared/config";
import { cn } from "@/shared/lib/cn";
import { formatRelativeTime } from "@/shared/lib/format";
import { Icon } from "@/shared/ui";
import { reporterName } from "../lib/reporter";
import { destinationClubs, routeLabels } from "../lib/route-label";
import type { TransferDealListItem, TransferReport } from "../model/types";
import { StatusBadge } from "./status-badge";
import { FeeValue } from "./fee-value";
import { CredibilityBadge } from "./credibility-badge";
import { CrestStack } from "./crest-stack";
import { TransferCrest } from "./transfer-crest";
import { playerName } from "../lib/player-name";

interface RumorCardProps {
  deal: TransferDealListItem;
  /** 캐러셀에 실린 근거인 최신 1차 보도 — `pickRecentRumors`가 `null`이 아님을 보장한다 */
  report: TransferReport;
  /** 기준 시각 — `serverNowMs ?? useNowMs()`는 뷰가 한다 */
  nowMs: number | null;
  /** 트랙의 첫 카드 — 첫 화면에 보이므로 엠블럼을 지연 로드하지 않는다 */
  priority?: boolean;
  /** 항목(`li`)에 더할 클래스 — 넓은 화면의 그리드에서 몇 장까지 보일지를 뷰가 정한다 */
  className?: string;
}

/**
 * "최근 3일 소식" 캐러셀의 300px 카드. 가로 스냅 트랙의 항목이라 `li` + `Link`.
 *
 * ⚠ **확률이 없다** — 푸터는 상태 뱃지 · 우측 이적료뿐(`확률 N%`는 보류).
 * ⚠ 보도 주체는 **목록·타임라인과 같은 한국어 표기**(`reporterName` — "벤 제이콥스")다. 소스 등록용 영어 라벨을
 *   쓰면 화면마다 같은 기자가 "Fabrizio Romano"·"파브리지오 로마노"로 갈린다.
 * ⚠ md+에서는 가로 트랙이 아니라 그리드의 칸이라 폭을 칸에 맡긴다(`md:w-auto`).
 * ⚠ 링크의 `data-deal-id`는 lg+에서 보드가 클릭을 가로채 오른쪽 판에 여는 표지다(`DealRow`와 같다).
 * ⚠ 요지는 2줄 클램프 + `min-h-10`으로 카드 높이를 맞춘다 — 요지가 없는 보도가 섞여도 트랙이
 *   들쭉날쭉하지 않게.
 * ⚠ `memo`·`prefetch={false}` — 사유는 `DealRow`와 같다(행을 고를 때마다 보드가 다시 그려진다 · 동적 상세의 뷰포트 프리페치는
 *   받아 오는 것이 거의 없고 2분할 폭에서는 클릭이 선택으로 가로채진다).
 */
export const RumorCard = memo(function RumorCard({ deal, report, nowMs, priority, className }: RumorCardProps) {
  const name = playerName(deal);
  const route = routeLabels(deal);
  const destinations = destinationClubs(deal);

  return (
    <li className={cn("w-[300px] shrink-0 snap-start md:w-auto", className)}>
      <Link
        href={ROUTES.transfer(deal.id)}
        prefetch={false}
        data-deal-id={deal.id}
        className="block rounded-lg border border-hairline bg-canvas px-4 py-3.5 transition-colors md:h-full duration-150 ease-otb active:bg-canvas-soft"
      >
        <div className="flex items-center gap-[7px] text-[12px] text-ink">
          <CredibilityBadge report={report} />
          <span className="truncate font-medium">{reporterName(report)}</span>
          <time
            dateTime={report.publishedAt}
            className="ml-auto shrink-0 whitespace-nowrap font-mono text-[10px] tabular-nums text-ink-mute-2"
          >
            {formatRelativeTime(report.publishedAt, nowMs)}
          </time>
        </div>

        {/* 경로 블록 — 3열 `1fr 40px 1fr`, 로고 40 + 약칭. 행선지만 500 ink */}
        <div className="mt-4 mb-3.5 grid grid-cols-[1fr_40px_1fr] items-center rounded-md border border-hairline-cool bg-canvas-soft py-3.5">
          <span className="flex flex-col items-center gap-[7px] whitespace-nowrap text-[12px] text-ink-mute">
            <TransferCrest club={deal.fromClub} size={40} priority={priority} />
            <span className="max-w-full truncate px-1">
              {route.from}
            </span>
          </span>
          <span className="flex justify-center text-ink">
            <Icon as={ArrowRight} size={18} />
            <span className="sr-only">, 행선지 </span>
          </span>
          <span className="flex flex-col items-center gap-[7px] text-[12px] font-medium text-ink">
            {destinations.length > 1 ? (
              <CrestStack clubs={destinations} size={40} />
            ) : (
              <TransferCrest club={destinations[0] ?? null} size={40} priority={priority} />
            )}
            {/* 관심 구단이 여럿이면 `routeLabels`가 접은 글자(앞 셋 + `외 N`)를 두 줄까지 흘린다(`ClubRoute`와 같은 판단) */}
            <span className={destinations.length > 1 ? "line-clamp-2 px-1 text-center md:break-keep" : "max-w-full truncate whitespace-nowrap px-1"}>
              {route.to}
            </span>
          </span>
        </div>

        <h3 className="truncate text-[20px] font-medium leading-[1.2] tracking-[-0.6px] text-ink">
          {name}
        </h3>
        <p
          lang={report.gist?.lang}
          className="mt-1.5 line-clamp-2 min-h-10 text-[13px] leading-[1.55] text-ink-secondary text-pretty"
        >
          {report.gist?.text}
        </p>

        <div className="mt-3 flex items-center gap-2 border-t border-hairline-cool pt-3">
          <StatusBadge stage={deal.stage} />
          <FeeValue deal={deal} className="ml-auto shrink-0 text-[15px] text-ink" />
        </div>
      </Link>
    </li>
  );
});
