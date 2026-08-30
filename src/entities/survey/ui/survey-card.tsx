"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { formatRelativeTime, useNowMs } from "@/shared/lib";
import { Icon } from "@/shared/ui";
import type { SurveyListItem } from "../model/types";

/**
 * 목록의 입축구 한 줄. 링크로 감싼 리스트 행이라 article 래퍼 없이 li만 쓴다.
 * 제목은 구역 헤딩(h2) 아래 계층이라 h3.
 *
 * ⚠ **참여자 수를 그리지 않는다.** 득표수 컬럼이 없어 집계는 `survey_results`를 거쳐야
 *   하는데 그건 참여자에게만 열린다 — 목록에서 부르면 미참여자에게 0이 나가 거짓말이 된다
 *   (마이그레이션 20260823000001 머리말의 트레이드오프).
 *
 * ⚠ 참여 표시를 에메랄드로 칠하지 않는다 — `styling.md`의 **에메랄드 자리 표에 이 파일이
 *   없다.** 칠하려면 표와 `check:conventions`에 함께 올려야 하고, 그때는 대비도 함께 본다
 *   (에메랄드는 흰 배경 1.99:1이라 형태 없는 표시를 실을 수 없다). 잉크 래더로만 구분한다.
 *
 * ⚠ `formatRelativeTime`은 **`nowMs`를 인자로 받는다**(`PostCard`와 같은 형태). 목록이
 *   SSR이라 렌더 중에 시계를 읽으면 서버와 하이드레이션이 다른 값을 만든다.
 */
export function SurveyCard({
  survey,
  serverNowMs,
}: {
  survey: SurveyListItem;
  /** 서버가 렌더한 시점의 시각 — 상대시각이 첫 프레임부터 그려지게 한다 */
  serverNowMs?: number;
}) {
  // ⚠ 렌더 중 시계를 읽지 않는다 — SSR HTML과 하이드레이션이 갈린다(format.ts 주석).
  //   마운트 전에는 서버가 준 시각을 쓴다.
  // ⚠ **서버 시각이 우선이다** — `useNowMs()`는 모듈 스코프에 세션당 한 번 고정되어 앱을
  //   처음 연 순간에 굳는다(사유는 `use-now.ts`). 그 값을 앞에 두면 갓 받은 서버 시각을
  //   낡은 클라 시계가 이긴다.
  const clientNowMs = useNowMs();
  const nowMs = serverNowMs ?? clientNowMs ?? null;

  return (
    <li>
      <Link
        href={ROUTES.survey(survey.id)}
        className="block border-b border-hairline-cool px-5 py-4 transition-colors duration-150 ease-otb active:bg-canvas-soft"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.4px] text-ink-mute-2">
            입축구
          </span>
          {survey.myOptionId !== null && (
            <span className="inline-flex items-center gap-[3px] text-[10px] font-medium text-ink">
              <Icon as={Check} size={11} />
              참여 완료
            </span>
          )}
        </div>

        {/* 제목도 2행에서 자른다 — DB 한도(1,000 코드포인트)가 화면 한도보다 넓다 */}
        <h3 className="mt-[5px] line-clamp-2 text-pretty text-[15px] font-medium leading-[1.4] tracking-[-0.3px] text-ink">
          {survey.title}
        </h3>

        <div className="mt-[9px] text-[11px] text-ink-mute-2">
          <time dateTime={survey.createdAt}>{formatRelativeTime(survey.createdAt, nowMs)}</time>
        </div>
      </Link>
    </li>
  );
}
