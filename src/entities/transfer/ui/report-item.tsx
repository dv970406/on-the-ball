// ⚠ `"use client"`가 없다 — 상호작용이 없는 렌더러라 서버 렌더 여지를 남긴다(`architecture.md`).
//    그래서 순수 함수는 배럴이 아니라 직접 경로로 가져온다(`credibility-badge.tsx`와 같은 이유).
import { ExternalLink } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { formatRelativeTime } from "@/shared/lib/format";
import { Icon } from "@/shared/ui";
import { reporterName } from "../lib/reporter";
import type { TransferReport } from "../model/types";
import { CredibilityBadge } from "./credibility-badge";

interface ReportItemProps {
  report: TransferReport;
  /** 레일의 점을 잉크로 칠한다 — **가장 최근 보도** 하나만(정렬과 무관하게 같은 보도가 잉크다) */
  latest: boolean;
  /** 기준 시각 — `serverNowMs ?? useNowMs()`는 호출부가 한다 */
  nowMs: number | null;
}

/**
 * 보도 타임라인의 항목 하나(`<li>`) — 공신력 · 보도 주체 · 시간 / 요지 / 원문 보기.
 * 딜 상세의 보도 타임라인과 보드의 오른쪽 판(`widgets/deal-panel`)의 최신 보도가 같은 항목을 그린다.
 *
 * - 요지는 한국어 요약(없으면 영문 발췌 — 매퍼가 고른다)이고 두 줄에서 자른다. 없으면 그 행을 생략한다.
 * - 원문 주소는 `originalUrl`(원저자 주소 우선 — 매퍼가 정한다). 없으면 링크를 그리지 않는다.
 *   ⚠ `target=_blank`에는 `rel="noopener noreferrer"`가 필수다(탭 납치).
 * - 좌측 7px 점은 컨트롤이 아니라 **레일의 표시 요소**라 `rounded-full`이 알약 규칙의 대상이 아니다
 *   (`styling.md` "대상이 아닌 것").
 * ⚠ 부모는 `<ol>`이다 — 항목 사이 선은 이 항목이 갖고(`first:border-t-0`) 목록은 선을 긋지 않는다.
 */
export function ReportItem({ report, latest, nowMs }: ReportItemProps) {
  return (
    <li className="grid grid-cols-[14px_1fr] gap-2.5 border-t border-hairline-cool py-3 first:border-t-0">
      <span className="flex justify-center pt-[5px]" aria-hidden>
        <span className={cn("size-[7px] rounded-full", latest ? "bg-ink" : "bg-hairline-strong")} />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-[7px] text-[12px]">
          <CredibilityBadge report={report} />
          <b className="truncate font-medium text-ink">{reporterName(report)}</b>
          <time
            dateTime={report.publishedAt}
            className="ml-auto shrink-0 whitespace-nowrap font-mono text-[10px] tabular-nums text-ink-mute-2"
          >
            {formatRelativeTime(report.publishedAt, nowMs)}
          </time>
        </div>
        {report.gist && (
          // ⚠ 두 줄에서 자른다 — 영문 발췌(최대 280자)는 4~5줄로 늘어 타임라인이 읽히지 않았다. 전문은 바로 아래
          //   "원문 보기"가 갖는다. CSS 클램프라 HTML에는 그대로 남는다(크롤러가 읽는 본문은 줄지 않는다).
          <p
            lang={report.gist.lang}
            className="mt-1.5 line-clamp-2 text-[14px] leading-[1.55] text-ink-secondary text-pretty"
          >
            {report.gist.text}
          </p>
        )}
        {report.originalUrl && (
          <a
            href={report.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex min-h-8 items-center gap-1 text-[12px] font-medium text-ink underline decoration-hairline-strong underline-offset-[3px] hover:decoration-ink"
          >
            원문 보기
            <Icon as={ExternalLink} size={12} />
            <span className="sr-only">(새 창)</span>
          </a>
        )}
      </div>
    </li>
  );
}
