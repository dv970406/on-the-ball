// ⚠ `"use client"`가 없다 — 상호작용이 없는 렌더러라 서버 렌더 여지를 남긴다(`architecture.md`)
import Link from "next/link";
import { ROUTES } from "@/shared/config";
import { formatCount } from "@/shared/lib/format";
import { playerName } from "../lib/player-name";
import type { TransferDayEntry } from "../model/types";
import { ClubRoute } from "./club-route";
import { ReportItem } from "./report-item";
import { StatusBadge } from "./status-badge";

interface DayEntryProps {
  entry: TransferDayEntry;
}

/**
 * 날짜별 소식의 딜 하나 — 머리(지금 상태 · 선수 · 경로)와 **그 날** 나온 보도(최신순).
 *
 * - 선수 이름이 딜 상세로 가는 링크다 — 날짜 화면이 크롤러에게 딜로 가는 길이 된다.
 * - 뱃지는 딜의 **지금** 상태다(그 날의 상태가 아니다 — `groupDayEntries` 주석). 보도 수는 그 날의 수다.
 * - 보도 시각은 시:분이다(`ReportItem`의 `clock`) — 날짜는 화면 제목이 말한다.
 * ⚠ 독립 콘텐츠라 `article`이다(링크로 감싼 목록 행이 아니다 — 안에 링크가 여럿이다). 제목은 `h3`다(h1 날짜 → h2 구간 → h3 선수).
 * ⚠ 링크 프리페치를 끈다 — 딜 상세는 loading 경계가 없는 동적 라우트라 뷰포트 프리페치가 받아 오는 것이 없다(`DealRow`와 같은 판단).
 */
export function DayEntry({ entry }: DayEntryProps) {
  const { deal, reports } = entry;
  const titleId = `day-deal-${deal.id}`;
  return (
    <article aria-labelledby={titleId} className="border-t border-hairline-cool py-4 first:border-t-0">
      <header className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <StatusBadge stage={deal.stage} />
          <span className="font-mono text-[11px] tabular-nums text-ink-mute-2">
            보도 {formatCount(reports.length)}건
          </span>
        </div>
        <h3 id={titleId} className="text-[16px] font-semibold leading-[1.3] tracking-[-0.3px] text-ink">
          <Link
            href={ROUTES.transfer(deal.id)}
            prefetch={false}
            className="underline decoration-transparent underline-offset-[3px] transition-colors duration-150 ease-otb hover:decoration-ink"
          >
            {playerName(deal)}
          </Link>
        </h3>
        <ClubRoute deal={deal} size={16} />
      </header>
      <ol className="mt-1">
        {reports.map((report, i) => (
          // 잉크 점은 그 딜의 **가장 최근 보도**만이다(`ReportItem` 계약) — 지난 날 화면의 첫 보도는 그 딜의 최신이 아닐 수 있다.
          //   그 딜의 최신 보도가 이 날에 있으면(딜의 최신 시각과 같으면) 그 한 건에만 찍는다
          <ReportItem
            key={report.id}
            report={report}
            latest={i === 0 && Date.parse(report.publishedAt) === Date.parse(deal.latestReportedAt)}
            nowMs={null}
            clock
          />
        ))}
      </ol>
    </article>
  );
}
