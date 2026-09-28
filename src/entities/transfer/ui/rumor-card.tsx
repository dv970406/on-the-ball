"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ROUTES } from "@/shared/config";
import { formatRelativeTime } from "@/shared/lib";
import { Icon } from "@/shared/ui";
import { reporterName } from "../lib/reporter";
import { destinationClubs, routeLabels } from "../lib/route-label";
import type { TransferDealListItem, TransferReport } from "../model/types";
import { StatusBadge } from "./status-badge";
import { FeeValue } from "./fee-value";
import { CredibilityBadge } from "./credibility-badge";
import { CrestStack } from "./crest-stack";
import { TransferCrest } from "./transfer-crest";


interface RumorCardProps {
  deal: TransferDealListItem;
  /** 캐러셀에 실린 근거인 최신 1차 보도 — `pickRecentRumors`가 `null`이 아님을 보장한다 */
  report: TransferReport;
  /** 기준 시각 — `serverNowMs ?? useNowMs()`는 뷰가 한다 */
  nowMs: number | null;
}

/**
 * "최근 3일 소식" 캐러셀의 300px 카드(handoff §4-1). 가로 스냅 트랙의 항목이라 `li` + `Link`.
 *
 * ⚠ **확률이 없다** — 푸터는 상태 뱃지 · 우측 이적료뿐(`확률 N%`는 보류 — 계획서 §0).
 * ⚠ 보도 주체는 **목록·타임라인과 같은 한국어 표기**(`reporterName` — "벤 제이콥스")다. 소스 등록용 영어 라벨을
 *   쓰면 화면마다 같은 기자가 "Fabrizio Romano"·"파브리지오 로마노"로 갈린다.
 * ⚠ 요지는 2줄 클램프 + `min-h-10`으로 카드 높이를 맞춘다 — 요지가 없는 보도가 섞여도 트랙이
 *   들쭉날쭉하지 않게.
 */
export function RumorCard({ deal, report, nowMs }: RumorCardProps) {
  const name = deal.playerKo ?? deal.player;
  const route = routeLabels(deal);
  const destinations = destinationClubs(deal);

  return (
    <li className="w-[300px] shrink-0 snap-start">
      <Link
        href={ROUTES.transfer(deal.id)}
        className="block rounded-lg border border-hairline bg-canvas px-4 py-3.5 transition-colors duration-150 ease-otb active:bg-canvas-soft"
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
            <TransferCrest club={deal.fromClub} size={40} />
            <span className="max-w-full truncate px-1">
              {route.from}
            </span>
          </span>
          <span className="flex justify-center text-ink">
            <Icon as={ArrowRight} size={18} />
            <span className="sr-only">에서</span>
          </span>
          <span className="flex flex-col items-center gap-[7px] text-[12px] font-medium text-ink">
            {destinations.length > 1 ? (
              <CrestStack clubs={destinations} size={40} />
            ) : (
              <TransferCrest club={destinations[0] ?? null} size={40} />
            )}
            {/* 관심 구단이 여럿이면 `routeLabels`가 접은 글자(앞 셋 + `외 N`)를 두 줄까지 흘린다(`ClubRoute`와 같은 판단) */}
            <span className={destinations.length > 1 ? "line-clamp-2 px-1 text-center" : "max-w-full truncate whitespace-nowrap px-1"}>
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
}
