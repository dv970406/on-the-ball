"use client";

import Link from "next/link";
import { ROUTES } from "@/shared/config";
import { cn, formatKickoff, useNowMs } from "@/shared/lib";
import { Pill } from "@/shared/ui";
import { isMatchInProgress, isMatchSettled } from "../lib/open";
import type { Match } from "../model/types";
import { MATCH_PICK_LABEL } from "../model/types";

/**
 * 목록의 경기 한 줄. 링크로 감싼 리스트 행이라 article 래퍼 없이 li만 쓴다(`SurveyCard`와 같은 형태).
 *
 * ⚠ 렌더 중에 시계를 읽지 않는다 — 킥오프 표기가 `nowMs`를 받아 연도 표시를 정한다.
 * ⚠ **`serverNowMs`가 없으면 SSR에서 시프트한다** — 마운트 전에는 연도가 붙었다가
 *   (`nowMs`가 null이면 항상 붙인다) 마운트 직후 사라지며 글자 폭이 변한다.
 *   목록이 SSR되므로 서버 시각을 받아 **첫 프레임부터 최종 모습**을 그린다.
 */
export function MatchCard({
  match,
  serverNowMs,
}: {
  match: Match;
  /** 서버가 렌더한 시점의 시각 — 마운트 전 판정의 기준(`PostCard`와 같은 형태) */
  serverNowMs?: number;
}) {
  // ⚠ **서버 시각이 우선이다** — `useNowMs()`는 모듈 스코프에 세션당 한 번 고정된다
  //   (사유는 `use-now.ts`·`data-and-state.md`). 클라 값을 앞에 두면 낡은 시계가 이긴다.
  //   ⚠ `??`는 단축평가라 훅을 뒤에 두면 조건부 호출이 된다 → 먼저 무조건 부른다.
  const clientNowMs = useNowMs();
  const nowMs = serverNowMs ?? clientNowMs ?? null;
  const settled = isMatchSettled(match);
  const scored = match.homeScore !== null && match.awayScore !== null;
  // 판정은 `isMatchInProgress`가 단독으로 소유한다 — 상한이 왜 필요한지는 그 함수 주석에
  const inProgress = nowMs !== null && isMatchInProgress(match, nowMs);

  return (
    <li>
      <Link
        href={ROUTES.match(match.id)}
        className="block border-b border-hairline-cool px-5 py-4 transition-colors duration-150 ease-otb active:bg-canvas-soft"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.4px] text-ink-mute-2">
            {match.matchday}R
          </span>
          <time dateTime={match.kickoffAt} className="text-[11px] text-ink-mute-2">
            {formatKickoff(match.kickoffAt, nowMs)}
          </time>
          {match.isVoided && <Pill variant="outline">취소됨</Pill>}
          {inProgress && <Pill variant="outline">진행 중</Pill>}
        </div>

        {/* 대진이 곧 이 행의 제목이다 — 읽으면 "리버풀 2 - 1 아스날"이 된다 */}
        <h3 className="mt-1.5 flex items-center gap-2 text-[15px] leading-[1.4] tracking-[-0.3px]">
          <span className="min-w-0 flex-1 truncate text-right font-medium text-ink">
            {match.homeTeam.name}
          </span>
          <span
            className={cn(
              "shrink-0 font-mono tabular-nums",
              scored ? "text-[15px] font-semibold text-ink" : "text-[11px] text-ink-mute-2",
            )}
          >
            {scored ? `${match.homeScore} - ${match.awayScore}` : "VS"}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium text-ink">
            {match.awayTeam.name}
          </span>
        </h3>

        {/*
          ⚠ **내가 예측한 경기에만 뜬다.** 채점된 경기 전부에 배지를 달면 목록이 색으로
            뒤덮여 "한 뷰포트당 컬러 이벤트"가 무너진다 — 대부분의 카드는 이 줄이 없다.
        */}
        {match.myPick !== null && (
          <p className="mt-2 flex items-center gap-2 text-[12px] text-ink-mute">
            {/*
              ⚠ **상세와 같은 어휘를 쓴다.** 목록만 "홈 승"으로 말하면 사용자가 어느 팀인지
                다시 매핑해야 하고, `MATCH_PICK_LABEL` 주석 스스로 "팀을 모르는 자리용"이라
                적어 뒀는데 여기는 바로 윗줄에 두 팀 이름을 그리는 **팀을 아는 자리**다.
            */}
            <span>
              내 예측{" "}
              <span className="font-medium text-ink-secondary">
                {match.myPick === "draw"
                  ? MATCH_PICK_LABEL.draw
                  : `${(match.myPick === "home" ? match.homeTeam : match.awayTeam).shortName} 승`}
              </span>
            </span>
            {settled &&
              (match.result === match.myPick ? (
                <Pill variant="green">적중</Pill>
              ) : (
                <Pill variant="crimson">실패</Pill>
              ))}
          </p>
        )}
      </Link>
    </li>
  );
}
