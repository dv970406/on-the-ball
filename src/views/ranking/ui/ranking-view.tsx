"use client";

import { ROUTES, avatarUrl, predictionRound } from "@/shared/config";
import { formatCount, serverToClientTime, useNowMs } from "@/shared/lib";
import { Avatar, EmptyState, Pill, Skeleton, StaleBanner } from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";
import { type PredictionScore, useMyScoreQuery, useRankingQuery } from "@/entities/prediction";
import { useSessionStore } from "@/entities/session";

interface RankingViewProps {
  /** 서버가 미리 조회한 랭킹 — `undefined`면 클라이언트가 조회한다 */
  initialRanking?: PredictionScore[];
  /**
   * 서버가 본 로그인 사용자 — 세션 복원 전에도 "나" 표시와 내 순위 칸을 서버 HTML과 같게 그린다
   * (안 내리면 복원 직후 내 줄에 표시가 붙으며 줄이 흔들린다).
   */
  initialUserId?: string;
  /** 서버가 이 데이터를 읽은 시각 — 회차 안내(어느 창이 언제 채점되는가)와 신선도의 기준 */
  serverNowMs?: number;
}

/**
 * 예측 랭킹 — 딜 성사 예측을 가장 잘 맞힌 팬의 순위(공개).
 *
 * 점수·순위는 파생 스크립트가 매시 채점해 쓴다(`transfer_prediction_score`) — 화면은 읽기만 한다. 순위가 같은 줄은
 * 사용자 id 순으로 고정한다(`buildRankingQuery`).
 *
 * ⚠ 랭킹은 "나"와 무관한 공개 데이터라 서버가 익명으로 받아 그린다. 로그인 사용자의 "나" 표시만 세션으로 가른다 —
 *   목록 밖(상위 `RANKING_LIMIT` 밖)이면 내 점수를 따로 받아 위에 적는다.
 */
export function RankingView({ initialRanking, initialUserId, serverNowMs }: RankingViewProps) {
  const sessionStatus = useSessionStore((s) => s.status);
  const storeUserId = useSessionStore((s) => s.user?.id);
  const userId = sessionStatus === "loading" ? initialUserId : storeUserId;

  const ranking = useRankingQuery({
    initialData: initialRanking,
    initialDataUpdatedAt: () => (serverNowMs === undefined ? undefined : serverToClientTime(serverNowMs)),
  });
  const mineInList = userId ? ranking.data?.find((s) => s.userId === userId) : undefined;
  // 목록에 내가 없을 때만 따로 받는다 — 있으면 같은 줄을 두 번 받을 이유가 없다
  const myScore = useMyScoreQuery(ranking.data && !mineInList ? userId : undefined);
  const mine = mineInList ?? myScore.data ?? null;

  // ⚠ 서버 시각이 먼저다(`data-and-state.md`) — 훅은 무조건 먼저 부른다
  const clientNowMs = useNowMs();
  const nowMs = serverNowMs ?? clientNowMs;
  const round = nowMs === null ? null : predictionRound(nowMs);

  return (
    <>
      <SubHeader title="예측 랭킹" fallbackHref={ROUTES.transferList} />
      {/*
        ⚠ `relative` — 순위의 `sr-only`(position:absolute)가 프레임까지 새지 않게 한다.
        넓은 화면(768px~)에서는 안쪽을 가운데 열로 모은다 — 스크롤 영역은 전체 폭으로 둬야 열 밖에서도 휠이 먹는다.
        ⚠ `md:[scrollbar-gutter:stable]` — 768px부터는 스크롤바가 보이므로(`no-scrollbar`), 로딩 스켈레톤(안 넘침)에서
          목록(넘침)으로 바뀔 때 스크롤바 폭만큼 가운데 열이 옆으로 흔들리지 않게 그 자리를 늘 잡아 둔다.
      */}
      <main className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto px-5 md:[scrollbar-gutter:stable] pb-[calc(32px+env(safe-area-inset-bottom))]">
        <div className="md:mx-auto md:max-w-[720px] md:pt-4">
          <header className="pt-4">
            {/* 제목은 서브헤더가 이미 보여 준다 — 같은 말을 두 번 그리지 않고 문서 구조에만 둔다(프로필과 같다) */}
            <h1 className="sr-only">예측 랭킹</h1>
            <p className="text-[13px] leading-[1.6] text-ink-mute">
              딜 상세에서 &quot;이번 창 안에 오피셜이 뜰까?&quot;를 예측하면, 창이 닫힌 뒤(오피셜이 뜨면 그때) 채점돼요.
              남들과 다른 예측을 맞힐수록 점수가 커요 — 맞히면 (100 − 같은 쪽을 고른 비율%)점이에요.
            </p>
          </header>

          {/* 내 순위 — 로그인 사용자에게만. 목록 밖이면 따로 받은 점수를 쓴다 */}
          {userId && (
            <section aria-labelledby="my-rank-heading" className="mt-4 rounded-lg border border-hairline p-3.5">
              <h2 id="my-rank-heading" className="font-mono text-[10px] uppercase tracking-[0.5px] text-ink-mute-2">
                내 순위
              </h2>
              {mine ? (
                <ScoreSummary score={mine} />
              ) : !ranking.data || myScore.isPending ? (
                <Skeleton className="mt-2 h-[22px] w-40" />
              ) : (
                <p className="mt-2 text-[13px] leading-[1.6] text-ink-mute">
                  아직 채점된 예측이 없어요.{round ? ` ${round.label} 예측은 그 창이 닫힌 뒤 채점돼요.` : ""}
                </p>
              )}
            </section>
          )}

          {ranking.isPending && (
            <div aria-hidden className="mt-5 flex flex-col gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          )}

          {/* 보여줄 데이터가 없을 때만 전체 대체한다(`data-and-state.md`) */}
          {ranking.error && !ranking.data && (
            <EmptyState
              className="pt-6"
              title="랭킹을 불러오지 못했어요"
              description={ranking.error.message}
              onRetry={() => ranking.refetch()}
            />
          )}
          {ranking.error && ranking.data && (
            <div className="mt-4">
              <StaleBanner noun="랭킹" onRetry={() => ranking.refetch()} />
            </div>
          )}

          {ranking.data && ranking.data.length === 0 && (
            <EmptyState
              className="pt-6"
              title="아직 채점된 예측이 없어요"
              description={
                round
                  ? `${round.label} 이적 창이 닫히면 첫 순위가 나와요. 그 전에 오피셜이 뜬 딜은 바로 채점돼요.`
                  : "이적 창이 닫히면 첫 순위가 나와요."
              }
            />
          )}

          {ranking.data && ranking.data.length > 0 && (
            <>
              {/*
                넓은 화면에서는 표처럼 읽히게 열 머리를 둔다 — 시각용이라 접근성 트리에서 뺀다(각 줄이 단위를 함께 말한다).
                열 폭은 아래 줄의 칸 폭과 한 쌍이다(순위 w-7 · 아바타 자리 · 점수·적중 w-28).
              */}
              <div
                aria-hidden
                className="mt-6 hidden items-center gap-3 border-b border-hairline pb-2 font-mono text-[10px] uppercase tracking-[0.5px] text-ink-mute-2 md:flex"
              >
                <span className="w-7 shrink-0 text-center">순위</span>
                <span className="flex-1 pl-11">팬</span>
                <span className="w-28 shrink-0 text-right">점수</span>
                <span className="w-28 shrink-0 text-right">적중</span>
              </div>
              <ol className="mt-5 flex flex-col md:mt-0">
                {ranking.data.map((score) => (
                  <li
                    key={score.userId}
                    className="flex items-center gap-3 border-b border-hairline-cool py-3 last:border-b-0 md:py-3.5"
                  >
                    <span className="w-7 shrink-0 text-center font-mono text-[14px] tabular-nums text-ink">
                      {score.rank}
                      <span className="sr-only">위</span>
                    </span>
                    <Avatar label={score.nickname} src={avatarUrl(score.avatarPath)} size={32} />
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[14px] font-medium text-ink">{score.nickname}</span>
                      {score.userId === userId && <Pill variant="dark">나</Pill>}
                    </span>
                    {/* 모바일은 점수 위·적중 아래 두 줄, 넓은 화면은 열 머리에 맞춘 두 칸 */}
                    <span className="ml-auto shrink-0 text-right md:flex md:items-center md:gap-3">
                      <span className="block font-mono text-[14px] tabular-nums text-ink md:w-28">
                        {formatCount(score.points)}점
                      </span>
                      <span className="block font-mono text-[11px] tabular-nums text-ink-mute-2 md:w-28 md:text-[13px] md:text-ink-mute">
                        {/* 넓은 화면에서는 열 머리가 "적중"을 말한다 — 글자는 스크린리더에만 남긴다 */}
                        <span className="md:sr-only">적중 </span>
                        {formatCount(score.hits)}/{formatCount(score.scored)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </main>
    </>
  );
}

/** 내 순위 한 줄 — 순위 · 점수 · 적중 */
function ScoreSummary({ score }: { score: PredictionScore }) {
  return (
    <p className="mt-2 flex items-baseline gap-3 font-mono tabular-nums text-ink">
      <span className="text-[20px] tracking-[-0.5px]">{formatCount(score.rank)}위</span>
      <span className="text-[14px]">{formatCount(score.points)}점</span>
      <span className="ml-auto text-[12px] text-ink-mute">
        적중 {formatCount(score.hits)}/{formatCount(score.scored)}
      </span>
    </p>
  );
}
