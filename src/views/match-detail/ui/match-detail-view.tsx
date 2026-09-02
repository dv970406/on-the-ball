"use client";

import { useState } from "react";
import {
  LineupBench,
  LineupPitch,
  StatComparison,
  buildStatRows,
  type Match,
  type MatchEvent,
  type MatchLineup,
  type MatchStat,
  type MatchPredictionResult,
  TeamCrest,
  isAwaitingResult,
  isMatchInProgress,
  isMatchSettled,
} from "@/entities/match";
import { MatchPrediction } from "@/features/predict-match";
import { ROUTES } from "@/shared/config";
import { cn, formatKickoff, useNowMs } from "@/shared/lib";
import { EmptyState, Pill, SignInDialog, Skeleton, StaleBanner } from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";
import { useMatchDetail } from "../model/use-match-detail";

interface MatchDetailViewProps {
  matchId: number;
  /**
   * 서버가 미리 조회한 경기. **SEO를 위해 초기 HTML에 대진·스코어가 담기게 하는 장치다.**
   * ⚠ 서버 조회가 실패하면 `undefined`가 오고 화면은 클라이언트 쿼리로 폴백한다.
   */
  initialMatch?: Match;
  /**
   * 서버가 본 로그인 사용자.
   * ⚠ **이게 없으면 프리페치가 무의미해진다** — `matchKeys.detail`이 userId로 스코프돼 있어
   *   복원 전 `undefined` 키로 찾으면 서버가 채운 캐시에 닿지 못한다.
   */
  initialUserId?: string;
  /** 서버가 미리 조회한 예측 분포 — **킥오프가 지났을 때만** 온다(막대 시프트를 막는다) */
  initialResults?: MatchPredictionResult[];
  /**
   * 서버가 미리 조회한 확정 라인업.
   * ⚠ 게이팅이 시각이 아니라 **행의 존재**라 조건 없이 내려온다 — 빈 배열이면 아직 발표 전이다.
   */
  initialLineups?: MatchLineup[];
  /** 서버가 미리 조회한 득점·카드·교체 — 라인업과 같은 규약(`[]`는 "아직 없음") */
  initialEvents?: MatchEvent[];
  /** 서버가 미리 조회한 팀 스탯 */
  initialStats?: MatchStat[];
  /**
   * 서버가 렌더한 시점의 시각.
   * ⚠ **`MatchPrediction`까지 흘려보내야 한다** — 거기서 마감을 판정하는데 `useNowMs()`는
   *   서버에서 `null`이라, 이 값이 없으면 **킥오프가 지난 경기가 예측 가능한 상태로 SSR된다.**
   */
  serverNowMs?: number;
}

/**
 * 경기 상세 — 대진·결과 + 승부예측.
 *
 * 하단 탭바를 렌더하지 않는다(글·입축구 상세와 같다 — 서브헤더 화면이다).
 */
export function MatchDetailView({
  matchId,
  initialMatch,
  initialUserId,
  initialResults,
  initialLineups,
  initialEvents,
  initialStats,
  serverNowMs,
}: MatchDetailViewProps) {
  // 조회·대기 판정은 `model/use-match-detail`이 소유한다
  const { match, isLoading, error, refetch, detail } = useMatchDetail({
    matchId,
    initialMatch,
    initialUserId,
    initialLineups,
    initialEvents,
    initialStats,
  });

  /**
   * 비로그인이 예측을 눌렀을 때의 안내 — **뷰가 소유한다**(`Dialog`가 `absolute`라
   * 액션 컴포넌트 안에 두면 스크롤 영역 기준으로 떠서 화면 밖에 뜬다).
   */
  const [askSignIn, setAskSignIn] = useState(false);
  // ⚠ **서버 시각이 우선이다** — `useNowMs()`는 모듈 스코프에 세션당 한 번 고정된다
  //   (사유는 `use-now.ts`·`data-and-state.md`). 클라 값을 앞에 두면 낡은 시계가 이긴다.
  //   ⚠ `??`는 단축평가라 훅을 뒤에 두면 조건부 호출이 된다 → 먼저 무조건 부른다.
  const clientNowMs = useNowMs();
  const nowMs = serverNowMs ?? clientNowMs ?? null;

  /**
   * ⚠ **양 팀이 다 있을 때만 피치를 그린다.** 한쪽만 오는 경우가 실제로 있는데(제공자가
   *   한 팀 시트만 먼저 낸다), 반쪽 피치는 "상대 팀은 아직 안 나왔다"가 아니라 "이 경기는
   *   11명이 뛴다"로 읽힌다.
   * ⚠ 조회 실패도 같은 분기로 떨어진다 — 곁다리라 실패해도 본문을 가리지 않는다(훅 주석).
   */
  // ⚠ 타입 주석을 붙이지 않는다 — `detail.lineups`가 이미 `MatchLineup[] | undefined`다
  const home = detail.lineups?.find((l) => l.side === "home");
  const away = detail.lineups?.find((l) => l.side === "away");
  /**
   * 기록 표가 **실제로 그려지는가** — 출처 문구가 이 값을 함께 본다.
   * ⚠ `stats.length > 0`으로 세면 안 된다. `buildStatRows`가 **양쪽 값이 다 있는 항목만**
   *   남기므로, 표시 목록에 없는 키만 저장된 경기는 행이 0이라 표가 `null`인데 **출처 문구만
   *   남는다.** 판정을 같은 함수가 갖게 한다(`code-quality.md` 응집도).
   */
  const statRows = detail.stats ? buildStatRows(detail.stats) : [];

  const title = match ? `${match.homeTeam.name} vs ${match.awayTeam.name}` : "경기";
  // ⚠ **두 컬럼을 함께 본다** — `MatchCard`와 같은 판정이어야 한다(DB CHECK가 쌍을 강제하지만
  //   판정이 갈리면 한쪽만 채워진 행에서 `2 - null`이 그려진다).
  const scored =
    match !== undefined && match !== null && match.homeScore !== null && match.awayScore !== null;
  /** 판정은 `isMatchInProgress`가 단독으로 소유한다(상한이 필요한 이유는 그 함수 주석에) */
  const inProgress = match != null && nowMs !== null && isMatchInProgress(match, nowMs);
  /** ⚠ 목록 카드와 **같은 어휘**를 쓴다 — 침묵하면 과거 날짜 + `VS`가 "아직 시작 안 함"으로 읽힌다 */
  const awaiting = match != null && nowMs !== null && isAwaitingResult(match, nowMs);
  /*
   * 승패를 굵기와 잉크 단계로 말한다(`MatchCard`와 같은 규칙).
   * ⚠ **무승부·미채점(`result === null`)이면 둘 다 false**라 아무도 강조되지 않는다 —
   *   판정을 따로 두지 않아도 그 성질이 그대로 나온다.
   * ⚠ 진 쪽에 `ink-mute-2`(#9a9a9a, 대비 2.85:1)를 쓰지 않는다 → `ink-mute`(5.29:1).
   */
  const homeWon = match?.result === "home";
  const awayWon = match?.result === "away";
  /** 예측했고 채점까지 끝났을 때만 적중 여부를 말할 수 있다 */
  const hit =
    match != null && match.myPick !== null && isMatchSettled(match)
      ? match.result === match.myPick
      : null;

  return (
    <>
      <SubHeader title={title} titleHidden fallbackHref={ROUTES.matchList} />

      {/*
        ⚠ **스크롤 영역이 여기 있어야 한다.** 루트 프레임이 `h-dvh … overflow-hidden`이라
          `<main>`이 스스로 스크롤하지 않으면 넘친 내용에 **닿을 방법이 아예 없다** —
          휠도 터치도 먹지 않고 `scrollTop`으로만 움직인다(실측). 라인업·기록이 붙기 전에는
          내용이 프레임에 들어가 증상이 드러나지 않았을 뿐, 없던 문제가 아니다.
        ⚠ `h-full`이 아니라 `min-h-0 flex-1` — `SubHeader`와 형제라 `h-full`이면 프레임이
          헤더 높이만큼 넘친다(글 상세가 같은 주석을 갖는다).
      */}
      <main className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-16 pt-4">
        {isLoading && (
          <div aria-hidden>
            {/* ⚠ 골격이 실제 화면과 같아야 한다 — 헤더가 엠블럼(44px) + 이름 두 줄로 높아졌다 */}
            <Skeleton className="h-[15px] w-40" />
            <Skeleton className="mt-4 h-[78px] w-full" />
            <Skeleton className="mx-auto mt-2 h-[19px] w-44" />
            <Skeleton className="mt-6 h-[168px] w-full rounded-[14px]" />
          </div>
        )}

        {/* ⚠ 에러 화면은 **보여줄 데이터가 없을 때만** 띄운다 */}
        {error && !match && (
          <EmptyState
            title="경기를 불러오지 못했어요"
            description={error.message}
            onRetry={() => refetch()}
          />
        )}
        {error && match && <StaleBanner noun="경기" onRetry={() => refetch()} />}

        {match === null && (
          <EmptyState
            title="경기를 찾을 수 없어요"
            description="일정이 바뀌었거나 삭제된 경기예요."
          />
        )}

        {match && (
          <>
            <p className="flex items-center gap-2 text-[12px] text-ink-mute-2">
              <span className="font-mono uppercase tracking-[0.4px]">
                {match.season} · {match.matchday}R
              </span>
              {match.isVoided && <Pill variant="outline">취소됨</Pill>}
              {/*
                ⚠ **상세도 진행 중을 말해야 한다.** 목록 카드는 `진행 중` 배지를, 공유 카드는
                  "결과를 기다리는 중"을 말하는데 상세만 침묵해서, 지난 날짜 + `VS`가
                  "아직 시작 안 함"으로 읽혔다(공유 카드가 본문보다 많이 말하는 상태).
              */}
              {/* ⚠ 진행 중만 `dark`인 것은 위계다 — 취소·결과 대기는 "정보가 없다"이고
                    이것은 **지금 벌어지는 일**이다(`MatchCard`와 같은 판단). */}
              {inProgress && <Pill variant="dark">진행 중</Pill>}
              {awaiting && <Pill variant="outline">결과 대기</Pill>}
              {/*
                ⚠ **적중/실패를 상세에서도 글자로 말한다.** 목록 카드는 `적중`/`실패`라고
                  적는데 상세는 끝까지 말하지 않아, 같은 사실을 두 화면이 다른 어휘로
                  (상세는 아예 침묵으로) 다뤘다.
              */}
              {/*
                ⚠ **삼항으로 variant를 넘기지 않는다.** `variant={hit ? "green" : "crimson"}`은
                  `check:conventions`의 에메랄드 대조가 **리터럴을 훑기 때문에 보이지 않는다** —
                  화이트리스트를 우회하는 바로 그 형태다(실제로 이 자리에서 검사가 잡아냈다).
              */}
              {hit === true && <Pill variant="green">적중</Pill>}
              {hit === false && <Pill variant="crimson">실패</Pill>}
            </p>

            {/*
              대진이 이 화면의 h1이다 — 크롬 타이틀(SubHeader)과 역할이 다르다.

              ⚠ **목록 카드와 같은 시각 언어를 쓴다**(엠블럼 · 3열 그리드 · 승패 강조).
                예전엔 `flex-1` + 좌우 정렬 `truncate`라 팀 이름 길이에 따라 중심축이 흔들렸고,
                긴 정식명("맨체스터 유나이티드")은 잘렸다 — **잘린 팀 이름은 알아볼 수 없다.**
              ⚠ 여기는 목록과 달리 **정식명**이다(규약). 그래서 엠블럼을 이름 위에 얹어
                가로 폭을 이름에 전부 내주고, 두 줄로 접히는 것을 허용한다.
            */}
            <h1 className="mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-3">
              <span className="flex min-w-0 flex-col items-center gap-2.5">
                <TeamCrest team={match.homeTeam} size={44} />
                <span
                  className={cn(
                    "text-balance text-center text-[15px] leading-[1.35] tracking-[-0.3px]",
                    homeWon ? "font-bold text-ink" : "font-semibold",
                    awayWon ? "text-ink-mute" : "text-ink",
                  )}
                >
                  {match.homeTeam.name}
                </span>
              </span>

              {/* ⚠ 높이를 엠블럼(44px)에 맞춰 스코어의 중심이 엠블럼 중심과 맞게 한다 */}
              <span className="flex h-11 shrink-0 items-center font-mono tabular-nums">
                {scored ? (
                  <span className="flex items-center gap-2 text-[28px] font-bold">
                    <span className={awayWon ? "text-ink-mute" : "text-ink"}>{match.homeScore}</span>
                    <span className="text-ink-faint">-</span>
                    <span className={homeWon ? "text-ink-mute" : "text-ink"}>{match.awayScore}</span>
                  </span>
                ) : (
                  <span className="text-[15px] font-medium text-ink-mute-2">VS</span>
                )}
              </span>

              <span className="flex min-w-0 flex-col items-center gap-2.5">
                <TeamCrest team={match.awayTeam} size={44} />
                <span
                  className={cn(
                    "text-balance text-center text-[15px] leading-[1.35] tracking-[-0.3px]",
                    awayWon ? "font-bold text-ink" : "font-semibold",
                    homeWon ? "text-ink-mute" : "text-ink",
                  )}
                >
                  {match.awayTeam.name}
                </span>
              </span>
            </h1>

            <p className="mt-2 text-center text-[13px] text-ink-mute">
              <time dateTime={match.kickoffAt}>{formatKickoff(match.kickoffAt, nowMs)}</time>
              {" 킥오프"}
            </p>

            <div className="mt-6">
              <MatchPrediction
                match={match}
                onSignInRequired={() => setAskSignIn(true)}
                initialResults={initialResults}
                initialUserId={initialUserId}
                serverNowMs={serverNowMs}
              />
            </div>

            {/*
             * 확정 라인업 — **발표되기 전에는 블록 자체가 없다.**
             * ⚠ 스켈레톤을 두지 않는다. 라인업은 킥오프 20~40분 전에야 나오고 연기·취소된
             *   경기에는 영영 오지 않아서, 자리를 잡아 두면 **대부분의 시간에 오지 않을 것을
             *   기다리는 화면**이 된다(로딩 중 레이아웃이 튀지 않게 하려는 스켈레톤의 목적과
             *   반대다 — 여기서는 없는 게 정상이라 나타날 때 자라는 편이 맞다).
             * ⚠ 조회 실패도 조용히 넘긴다 — 곁다리라 본문(대진·예측)을 가리면 안 된다.
             */}
            {home && away ? (
              <>
                <LineupPitch
                  home={home}
                  away={away}
                  homeTeam={match.homeTeam}
                  awayTeam={match.awayTeam}
                  marks={detail.playerMarks}
                />
                <LineupBench
                  home={home}
                  away={away}
                  homeTeam={match.homeTeam}
                  awayTeam={match.awayTeam}
                  marks={detail.playerMarks}
                />
              </>
            ) : null}

            {/*
             * 경기 기록 — 라인업과 **독립적으로** 그린다.
             * ⚠ 라인업 블록 안에 넣지 않는다. 스탯은 킥오프 후에 생기고 라인업은 그 전에
             *   오므로 둘의 유무가 따로 논다 — 한쪽 조건에 묶으면 라인업이 없는 경기에서
             *   기록까지 사라진다(연기됐다가 치러진 경기가 실제로 그 모양이다).
             */}
            {statRows.length > 0 ? (
              <StatComparison rows={statRows} homeTeam={match.homeTeam} awayTeam={match.awayTeam} />
            ) : null}

            {/* 출처 — 평점·스탯이 제공자마다 값이 다르므로 어디 것인지 밝힌다 */}
            {(home && away) || statRows.length > 0 ? (
              <p className="mt-4 text-center text-[11px] text-ink-mute-2">
                라인업·기록 제공: API-Football
              </p>
            ) : null}
          </>
        )}
      </main>

      <SignInDialog
        open={askSignIn}
        onClose={() => setAskSignIn(false)}
        action="승부예측을 하려면"
      />
    </>
  );
}
