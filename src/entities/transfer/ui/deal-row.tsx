// ⚠ `"use client"`가 없다 — 상호작용이 없는 렌더러라 서버 렌더 여지를 남긴다(`architecture.md`).
//    그래서 순수 함수는 배럴이 아니라 직접 경로로 가져온다(`credibility-badge.tsx`와 같은 이유).
import Link from "next/link";
import { ROUTES } from "@/shared/config";
import { cn } from "@/shared/lib/cn";
import { formatRelativeTime } from "@/shared/lib/format";
import { reporterName } from "../lib/reporter";
import { isDeadStage } from "../lib/stage";
import type { TransferDealListItem } from "../model/types";
import { ClubRoute } from "./club-route";
import { FeeDelta } from "./fee-delta";
import { FeeValue } from "./fee-value";
import { StatusBadge } from "./status-badge";
import { CredibilityBadge } from "./credibility-badge";
import { WatchMark } from "./watch-mark";
import { playerName } from "../lib/player-name";

interface DealRowProps {
  deal: TransferDealListItem;
  /**
   * 기준 시각 — `serverNowMs ?? useNowMs()`는 **뷰가 한다**(순서 규약은 `data-and-state.md`).
   * `null`이면 상대시각 대신 절대시각이 그려진다(`formatRelativeTime` 계약).
   */
  nowMs: number | null;
  /**
   * 접힌 행 — HTML에는 남기고 화면에서만 가린다("더 보기" 전의 루머·긴 구간의 뒷장). 색인 화면의 본문 SSR·
   * 스크롤 복원을 지키려면 행을 빼는 것이 아니라 가려야 한다(`nextjs.md`의 탭 규약과 같다).
   */
  hidden?: boolean;
}

/**
 * 목록 행(진행 중 · 루머 · 결렬·부인) — 링크로 감싼 리스트 행이라 `li` + `Link`다
 * 
 *
 * 레이아웃: grid `minmax(0,1fr) auto` — 좌: 이름·경로 / 우: 이적료·변동폭 / 3행(meta)은 전폭.
 * 정렬선: `mx-2` + `px-3` = 콘텐츠 x=20 → 구간 제목·칩·카드와 같은 선.
 *
 * ⚠ **디바이더는 같은 구간의 행 사이에만** — `[&+&]:before:…`(형제 선택자)라 구간 첫 행 위·
 *   마지막 행 아래에는 없다. 좌우 `inset-x-3`로 행 패딩 안에서 끝난다.
 * ⚠ 결렬 변형: 행 `bg-[#f3f3f3] grayscale`(`@theme` 동결이라 arbitrary hex),
 *   이름·경로·이적료 `opacity-60`, meta `opacity-85`, 변동폭 생략(상태는 뱃지가 말한다), 출처 대신 최신
 *   보도 요지 1줄. **이름에는 취소선이 없다** — 행선지 약칭·이적료에만(`ClubRoute`가 진다).
 * ⚠ 이 행의 에메랄드는 `WatchMark`(관심)뿐이다 — 관심 딜에만 뜬다.
 * ⚠ 렌더 중에 시계를 읽지 않는다 — 상대시각은 `nowMs`를 받아 계산한다.
 */
export function DealRow({ deal, nowMs, hidden }: DealRowProps) {
  const dead = isDeadStage(deal.stage);
  const name = playerName(deal);
  const report = deal.latestReport;

  return (
    <li
      hidden={hidden === true ? true : undefined}
      className={cn(
        "relative mx-2 rounded-md",
        "[&+&]:before:absolute [&+&]:before:inset-x-3 [&+&]:before:top-0 [&+&]:before:h-px [&+&]:before:bg-hairline-cool [&+&]:before:content-['']",
        dead && "bg-[#f3f3f3] grayscale",
      )}
    >
      <Link
        href={ROUTES.transfer(deal.id)}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-[9px] rounded-md px-3 py-3 transition-colors duration-150 ease-otb active:bg-canvas-soft"
      >
        <div className={cn("min-w-0", dead && "opacity-60")}>
          {/* 화면의 계층이 h1(`BoardHeader`의 이적시장) → h2(구간) → h3(선수) */}
          <h3 className="flex items-center gap-[5px] text-[15px] font-medium leading-[1.3] tracking-[-0.3px] text-ink">
            {deal.isWatched && <WatchMark />}
            <span className="truncate">{name}</span>
          </h3>
          <ClubRoute deal={deal} size={16} className="mt-1.5" />
        </div>

        <div className={cn("flex flex-col items-end gap-[3px] text-right", dead && "opacity-60")}>
          <FeeValue
            deal={deal}
            className={cn(
              "text-[16px] leading-none tracking-[-0.5px]",
              dead ? "text-ink-mute-2 line-through decoration-hairline-strong" : "text-ink",
            )}
          />
          {/* 죽은 딜은 변동폭을 그리지 않는다 — 결렬·부인은 같은 행의 상태 뱃지가 말한다 */}
          {!dead && <FeeDelta deal={deal} lead />}
        </div>

        <div
          className={cn(
            "col-span-full flex min-w-0 items-center gap-2 text-[11px] text-ink-mute-2",
            dead && "opacity-85",
          )}
        >
          <StatusBadge stage={deal.stage} inline />
          {dead ? (
            // 결렬 사유 — 최신 보도 요지 1줄(한국어 요약, 없으면 영문 발췌)
            report?.gist && (
              <span lang={report.gist.lang} className="min-w-0 flex-1 truncate text-[12px] text-ink-mute">
                {report.gist.text}
              </span>
            )
          ) : (
            <span className="ml-auto inline-flex shrink-0 items-center gap-[5px] whitespace-nowrap text-ink-mute">
              {report && (
                <>
                  <CredibilityBadge report={report} />
                  {reporterName(report)}
                </>
              )}
              <time
                dateTime={deal.latestReportedAt}
                className="font-mono text-[10px] tabular-nums text-ink-mute-2"
              >
                · {formatRelativeTime(deal.latestReportedAt, nowMs)}
              </time>
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
