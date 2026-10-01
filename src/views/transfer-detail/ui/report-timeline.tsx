"use client";

import { ExternalLink } from "lucide-react";
import {
  CredibilityBadge,
  type TransferReport,
  reporterName,
} from "@/entities/transfer";
import { cn, formatRelativeTime } from "@/shared/lib";
import { Icon, Skeleton, StaleBanner } from "@/shared/ui";

interface ReportTimelineProps {
  /** `undefined`면 아직 받지 못한 것(로딩 또는 실패) — `[]`는 "받았는데 없다" */
  reports: TransferReport[] | undefined;
  /** 타임라인 조회 실패 — 본문은 그대로 두고 이 자리에서만 알린다 */
  error: Error | null;
  onRetry: () => void;
  /** 기준 시각 — `serverNowMs ?? useNowMs()`는 뷰가 한다 */
  nowMs: number | null;
}

/**
 * 보도 타임라인 탭의 내용 — 최신순, 항목마다 Tier · 보도 주체 · 매체 · 시간 / 요지 / 원문 보기.
 *
 * - 요지는 한국어 요약(없으면 영문 발췌 — 매퍼가 고른다)이고 두 줄에서 자른다. 없으면 그 행을 생략한다.
 * - 원문 주소는 `originalUrl`(원저자 주소 우선 — 매퍼가 정한다). 없으면 링크를 그리지 않는다.
 *   ⚠ `target=_blank`에는 `rel="noopener noreferrer"`가 필수다(탭 납치).
 * - 좌측 7px 점은 컨트롤이 아니라 **레일의 표시 요소**라 `rounded-full`이 알약 규칙의 대상이 아니다
 *   (`styling.md` "대상이 아닌 것"). 첫 항목(최신)만 잉크다.
 *
 * ⚠ **제목 줄(`보도 타임라인 · N REPORTS`)이 없다** — 탭이 제목과 건수를 대신한다.
 *   패널의 접근성 이름도 탭이 준다(`aria-labelledby` — 뷰가 패널을 감싼다).
 */
export function ReportTimeline({ reports, error, onRetry, nowMs }: ReportTimelineProps) {
  return (
    // ⚠ 첫 항목 위에는 선이 없다 — 탭 바의 아래 선이 그 자리를 맡는다(두 줄이 겹쳐 굵어 보인다)
    <>
      {reports === undefined && error === null && (
        // 골격은 실제 항목(1행 메타 + 요지 두 줄)과 같은 높이다
        <div aria-hidden className="py-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-2 h-[42px] w-full" />
        </div>
      )}

      {reports === undefined && error !== null && (
        <p className="py-3 text-[12px] text-ink-mute">
          보도를 불러오지 못했어요.{" "}
          <button type="button" onClick={onRetry} className="underline underline-offset-2">
            다시 시도
          </button>
        </p>
      )}

      {/* 받아 둔 타임라인은 그대로 두고 최신화 실패만 알린다(data-and-state.md) */}
      {reports !== undefined && error !== null && <StaleBanner noun="보도" onRetry={onRetry} />}

      {reports !== undefined && reports.length === 0 && (
        <p className="py-3 text-[12px] text-ink-mute">
          아직 연결된 보도가 없어요.
        </p>
      )}

      {reports !== undefined && reports.length > 0 && (
        <ol>
          {reports.map((report, index) => {
            return (
              <li
                key={report.id}
                className="grid grid-cols-[14px_1fr] gap-2.5 border-t border-hairline-cool py-3 first:border-t-0"
              >
                <span className="flex justify-center pt-[5px]" aria-hidden>
                  <span
                    className={cn(
                      "size-[7px] rounded-full",
                      index === 0 ? "bg-ink" : "bg-hairline-strong",
                    )}
                  />
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
                    // ⚠ 두 줄에서 자른다 — 영문 발췌(최대 280자)는 4~5줄로 늘어 타임라인이 읽히지
                    //   않았다. 전문은 바로 아래 "원문 보기"가 갖는다. CSS 클램프라 HTML에는 그대로
                    //   남는다(크롤러가 읽는 본문은 줄지 않는다).
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
          })}
        </ol>
      )}
    </>
  );
}
