"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { ROUTES } from "@/shared/config";
import { cn, formatKickoffTime, useNowMs } from "@/shared/lib";
import { Icon, Pill } from "@/shared/ui";
import { isAwaitingResult, isMatchInProgress, isMatchOpen, isMatchSettled } from "../lib/open";
import type { Match, MatchPick } from "../model/types";
import { MATCH_PICK_LABEL } from "../model/types";
import { TeamCrest } from "./team-crest";

/**
 * 승패를 **굵기와 잉크 단계**로 말한다.
 *
 * ⚠ 색만으로 지지 않는다(`styling.md`) — 굵기가 함께 움직이므로 색을 못 보는 사용자도
 *   이긴 쪽을 읽는다.
 * ⚠ **진 쪽에 `ink-mute-2`를 쓰지 않는다.** #9a9a9a는 흰 배경 대비 2.85:1이라 본문 기준에
 *   못 미친다 — `ink-mute`(#707070)가 5.29:1로 그 선을 넘는 가장 옅은 단계다.
 * ⚠ `result`가 `null`(미종료·무효)이거나 `draw`면 **아무도 강조하지 않는다.**
 */
function outcomeClassName(side: MatchPick, result: MatchPick | null) {
  if (result === null || result === "draw") return "text-ink";
  return result === side ? "text-ink" : "text-ink-mute";
}

/**
 * 목록의 경기 한 장. 링크로 감싼 리스트 행이라 article 래퍼 없이 li만 쓴다(`SurveyCard`와 같은 형태).
 *
 * ⚠ **날짜를 그리지 않는다 — 뷰의 날짜 헤딩이 갖는다.** 카드마다 "8월 28일 (금) 13:05"를
 *   되풀이하던 것이 이 화면에서 가장 긴 텍스트였다. 그래서 가운데 칸이 **아직 모르는 것**을
 *   담는다: 채점 전이면 킥오프 시각, 채점 후면 스코어(옛 `VS`는 아무 정보도 아니었다).
 *
 * ⚠ **좌우를 `grid-cols-[1fr_auto_1fr]`로 고정한다.** 예전엔 `flex-1` + 좌우 정렬이라
 *   팀 이름 길이에 따라 중심축이 행마다 흔들렸다. 그리드로 두면 두 엠블럼의 x좌표가 모든
 *   카드에서 같아져 목록을 훑는 스캔 라인이 생긴다.
 *
 * ⚠ 렌더 중에 시계를 읽지 않는다 — 상태 배지·예측 가능 여부가 `nowMs`를 받아 정해진다.
 * ⚠ **`serverNowMs`가 없으면 SSR에서 시프트한다** — 목록이 SSR되므로 서버 시각을 받아
 *   첫 프레임부터 최종 모습을 그린다.
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
  // 상태 판정은 전부 `lib/open`이 단독으로 소유한다 — 상세와 같은 어휘를 쓰기 위해서다
  const inProgress = nowMs !== null && isMatchInProgress(match, nowMs);
  const awaiting = nowMs !== null && isAwaitingResult(match, nowMs);
  const canPredict = nowMs !== null && isMatchOpen(match, nowMs);

  return (
    <li>
      <Link
        href={ROUTES.match(match.id)}
        className="block border-b border-hairline-cool px-5 py-3.5 transition-colors duration-150 ease-otb active:bg-canvas-soft"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.4px] text-ink-mute-2">
            {match.matchday}R
          </span>
          {/*
            ⚠ **`Pill variant`는 리터럴이어야 한다** — `check:conventions`의 에메랄드 대조가
              리터럴을 훑기 때문에 삼항으로 넘기면 화이트리스트를 조용히 우회한다.
            ⚠ 진행 중만 `dark`인 것은 위계다. 취소·결과 대기는 "정보가 없다"이고 진행 중은
              **지금 벌어지는 일**이라 가장 강하다. 에메랄드를 쓰지 않는 이유는 동시 킥오프가
              흔해서다 — 목록에 그 배지가 여러 개 깔리면 "한 뷰포트당 컬러 이벤트"가 무너진다.
          */}
          {match.isVoided && <Pill variant="outline">취소됨</Pill>}
          {inProgress && <Pill variant="dark">진행 중</Pill>}
          {/*
            ⚠ **침묵하면 거짓말이 된다.** 연기·스코어 미반영 경기는 과거 날짜에 스코어가
              비어 있어 "아직 시작 안 함"으로 읽혔다(사유는 `isAwaitingResult`).
          */}
          {awaiting && <Pill variant="outline">결과 대기</Pill>}
        </div>

        {/*
          대진이 이 카드의 제목이다. ⚠ **`h4`인 이유는 위에 날짜 헤딩(`h3`)이 있어서다** —
            화면의 계층이 h1(sr-only 승부예측) → h2(구역) → h3(날짜) → h4(대진)로 내려간다.
        */}
        <h4 className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 text-[15px] leading-[1.3] tracking-[-0.3px]">
          <span className="flex min-w-0 items-center justify-end gap-2">
            {/* ⚠ **목록은 약칭이다**(상세 제목만 정식명) — 정식명은 이 폭에서 두 줄이 된다 */}
            <span
              className={cn(
                "truncate",
                settled && match.result === "home" ? "font-semibold" : "font-medium",
                outcomeClassName("home", match.result),
              )}
            >
              {match.homeTeam.shortName}
            </span>
            <TeamCrest team={match.homeTeam} size={24} />
          </span>

          {scored ? (
            <span className="flex shrink-0 items-center gap-1.5 font-mono text-[17px] font-semibold tabular-nums">
              <span className={outcomeClassName("home", match.result)}>{match.homeScore}</span>
              <span className="text-ink-faint">-</span>
              <span className={outcomeClassName("away", match.result)}>{match.awayScore}</span>
            </span>
          ) : (
            // 아직 모르는 것이 스코어가 아니라 "언제 하는가"인 자리 — 날짜는 헤딩이 갖는다
            <time
              dateTime={match.kickoffAt}
              className="shrink-0 font-mono text-[13px] tabular-nums text-ink-mute"
            >
              {formatKickoffTime(match.kickoffAt)}
            </time>
          )}

          <span className="flex min-w-0 items-center gap-2">
            <TeamCrest team={match.awayTeam} size={24} />
            <span
              className={cn(
                "truncate",
                settled && match.result === "away" ? "font-semibold" : "font-medium",
                outcomeClassName("away", match.result),
              )}
            >
              {match.awayTeam.shortName}
            </span>
          </span>
        </h4>

        {/*
          ⚠ **내가 예측한 경기에만 배지가 뜬다.** 채점된 경기 전부에 달면 목록이 색으로
            뒤덮여 "한 뷰포트당 컬러 이벤트"가 무너진다.
        */}
        {match.myPick !== null && (
          <p className="mt-2 flex items-center justify-center gap-2 text-[12px] text-ink-mute">
            {/*
              ⚠ **팀을 가리키는 말은 상세와 같아야 한다.** "홈 승"으로 말하면 어느 팀인지 다시
                매핑해야 하고, 여기는 바로 윗줄에 두 팀을 그리는 **팀을 아는 자리**다.
              ⚠ 다만 **"승" 접미사는 상세와 일부러 갈린다.** 상세의 예측 블록은 세 줄이
                `아스날 / 무승부 / 첼시`로 놓이는 **보기 나열**이라 이름만으로 뜻이 완성되지만,
                여기는 "내 예측 …"에 이어지는 **문장**이라 "내 예측 아스날"이 어색해진다.
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

        {/*
          ⚠ **이 화면의 할 일을 카드가 말한다.** 예전에는 예측하지 않은 경기와 예측한 경기가
            "줄이 있나 없나"로만 갈려, 다가오는 구역에 아무 유도도 없었다. 줄이 늘 있으면
            카드 높이도 균일해져 목록의 리듬이 생긴다.
        */}
        {match.myPick === null && canPredict && (
          <p className="mt-2 flex items-center justify-center gap-0.5 text-[12px] text-ink-mute">
            예측하기
            <Icon as={ChevronRight} size={13} />
          </p>
        )}
      </Link>
    </li>
  );
}
