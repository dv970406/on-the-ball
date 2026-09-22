"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import type { MatchRanking } from "@/entities/match";
import { ROUTES } from "@/shared/config";
import { cn } from "@/shared/lib";
import { Chip, EmptyState, StaleBanner } from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";
import { useMatchRanking } from "../model/use-match-ranking";
import { LeaderboardBoard } from "./leaderboard-board";
import { MatchRankingSkeleton } from "./match-ranking-skeleton";

interface MatchRankingViewProps {
  /** 서버 프리페치 결과. `undefined`면 클라이언트가 조회하고, `null`이면 채점된 경기가 없다 */
  initialRanking?: MatchRanking | null;
  /**
   * 서버가 본 로그인 사용자.
   * ⚠ **이게 없으면 프리페치가 무의미해진다** — `matchKeys.ranking`이 userId로 스코프돼 있어
   *   복원 전 `undefined` 키로 찾으면 서버가 채운 캐시에 닿지 못하고 다시 조회한다.
   */
  initialUserId?: string;
}

type RankingScope = "season" | "round";

/**
 * 승부예측 랭킹 — 시즌 전체와 최근 라운드.
 *
 * 하단 탭바를 그리지 않는다(서브헤더 화면이다 — 공지 목록과 같은 자리).
 *
 * ⚠ **두 판을 모두 렌더하고 `hidden`으로만 가린다.** 이 라우트는 색인 대상이라 초기 HTML에
 *   두 순위가 다 담겨야 한다(`nextjs.md`의 "화면을 탭으로 갈라도 HTML에는 전부 남긴다").
 *   ⚠ 그래서 판에 `flex`·`grid` 같은 display 유틸을 얹지 않는다 — 작성자 스타일이 UA의
 *     `[hidden] { display: none }`을 이겨 가린 판이 그대로 보인다.
 * ⚠ **범위 전환은 `tablist`가 아니라 선택 칩이다.** 탭 컴포넌트는 이미 두 벌이라
 *   (`match-list-tabs`·경기 상세) 세 번째를 만들면 `shared/ui`로 올려야 하는데
 *   (`code-quality.md`의 공용화 기준), 여기는 선택지가 둘뿐인 보기 전환이라 작성 폼의 말머리와
 *   같은 `Chip`(`aria-pressed`)으로 충분하다. URL로 올리지 않는 이유: 두 판이 같은 응답 한 벌에
 *   담긴 보기 전환이라 별개 페이지로 색인될 자격이 없다(`nextjs.md`의 path/query 판단 기준).
 */
export function MatchRankingView({ initialRanking, initialUserId }: MatchRankingViewProps) {
  const { ranking, isLoading, isPlaceholderData, error, refetch, sessionStatus } = useMatchRanking({
    initialRanking,
    initialUserId,
  });
  // ⚠ 기본값이 데이터에 기대지 않는다(항상 시즌) — 그래서 `useState` 초기값으로 굳혀도 된다
  const [scope, setScope] = useState<RankingScope>("season");

  return (
    <>
      {/*
        ⚠ **제목은 헤더가 보이게 갖고 h1은 sr-only다** — 서브헤더를 쓰는 목록 화면(공지사항)과
          같은 형태다. 본문에 큰 h1을 세우면 목록이 아니라 상세 화면(공지·입축구 상세)처럼 읽힌다.
      */}
      <SubHeader title="승부예측 랭킹" fallbackHref={ROUTES.matchList} />

      {/*
        ⚠ 루트 프레임이 `h-dvh … overflow-hidden`이라 `<main>`이 스스로 스크롤하지 않으면
          넘친 내용에 닿을 방법이 없다(서브헤더 화면들과 같은 값).
      */}
      <main className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-10">
        <h1 className="sr-only">승부예측 랭킹</h1>

        {isLoading && <MatchRankingSkeleton />}

        {/* 보여줄 데이터가 없을 때만 화면을 대체한다 — 있으면 배너로만 알린다 */}
        {error && ranking === undefined && (
          <EmptyState
            title="랭킹을 불러오지 못했어요"
            description={error.message}
            onRetry={() => refetch()}
          />
        )}
        {error && ranking !== undefined && <StaleBanner noun="랭킹" onRetry={() => refetch()} />}

        {ranking === null && (
          <EmptyState
            icon={Trophy}
            title="아직 순위가 없어요"
            /* ⚠ "예측한 사람이 없다"고 말하지 않는다 — 순위는 **채점된** 경기로만 매기므로
               예측이 쌓여 있어도 결과가 나오기 전까지는 비어 있다(다른 말이다). */
            description="경기 결과가 나오면 맞힌 예측으로 순위가 매겨져요."
          />
        )}

        {ranking && (
          <div
            className={cn(
              "transition-opacity duration-150 ease-otb",
              // 계정이 바뀌는 동안 이전 순위가 남아 있다는 걸 은은하게 알린다(목록과 같은 처리)
              isPlaceholderData && "opacity-50",
            )}
          >
            {/* 간격은 커뮤니티의 말머리 레일과 같다(gap-1.5 · pt-4.5) */}
            <div className="flex gap-1.5 px-5 pt-4.5">
              <Chip selected={scope === "season"} onClick={() => setScope("season")}>
                시즌 전체
              </Chip>
              <Chip selected={scope === "round"} onClick={() => setScope("round")}>
                {ranking.matchday}라운드
              </Chip>
            </div>

            {/*
              시즌과 순위 규칙 — 공동 순위와 동률 처리를 숨기지 않는다(같은 적중인데 순위가 다르면
              이유를 알아야 한다). 시즌을 함께 적는 이유는 비시즌에 **지난 시즌** 순위가 뜨기 때문이다.
            */}
            {/* ⚠ `keep-all` — 없으면 좁은 폭에서 "경기 / 로"처럼 조사 앞에서 끊긴다(`Dialog`와 같은 처리) */}
            <p className="px-5 pb-3 pt-3 text-[12px] leading-[1.5] text-ink-mute-2 [word-break:keep-all]">
              <span className="text-ink-mute">{ranking.season} 시즌</span> · 맞힌 경기 수로 순위를
              매기고, 같으면 예측한 경기가 적은 쪽이 앞서요.
            </p>

            <section hidden={scope !== "season"}>
              <h2 className="sr-only">시즌 전체 순위</h2>
              <LeaderboardBoard
                entries={ranking.seasonBoard}
                sessionStatus={sessionStatus}
                // ⚠ "이번 시즌"이라 적지 않는다 — 비시즌에는 **지난 시즌** 판이 뜬다
                scopeLabel={`${ranking.season} 시즌`}
              />
            </section>

            <section hidden={scope !== "round"}>
              <h2 className="sr-only">{ranking.matchday}라운드 순위</h2>
              <LeaderboardBoard
                entries={ranking.roundBoard}
                sessionStatus={sessionStatus}
                scopeLabel={`${ranking.matchday}라운드`}
              />
            </section>
          </div>
        )}
      </main>
    </>
  );
}
