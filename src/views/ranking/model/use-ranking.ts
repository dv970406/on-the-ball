"use client";

import { type PredictionScore, useMyScoreQuery, useRankingQuery } from "@/entities/prediction";
import { useQueryScope } from "@/entities/session";
import { serverUpdatedAt } from "@/shared/lib";

interface UseRankingArgs {
  initialRanking?: PredictionScore[];
  initialUserId?: string;
  initialMyScore?: PredictionScore | null;
  serverNowMs?: number;
}

/** "내 순위" 칸의 상태 — 비로그인에게는 칸이 없다(`none`) */
export type MyRank =
  | { state: "none" | "loading" | "empty" }
  | { state: "ready"; score: PredictionScore }
  | { state: "error"; retry: () => void };

/**
 * 랭킹과 "내 순위". 내가 상위 목록 안에 있으면 그 줄을 쓰고, 밖이면 점수를 따로 받는다.
 *
 * ⚠ **실패와 "채점된 표 없음"을 가른다** — 점수의 `null`은 표가 없다는 답이고 `undefined`는 아직 답이 없다는 뜻이다(`nextjs.md`). 하나로 접으면 조회가
 *   실패한 사람에게 "아직 채점된 예측이 없어요"라고 말한다.
 * ⚠ 점수 조회를 랭킹의 **성공**에 묶지 않는다 — 랭킹이 끝날 때까지만 기다린다. 묶으면 랭킹이 실패한 사람의 칸이 스켈레톤에서 영영 멈춘다.
 */
export function useRanking({ initialRanking, initialUserId, initialMyScore, serverNowMs }: UseRankingArgs) {
  const { userId } = useQueryScope(initialUserId);
  const initialDataUpdatedAt = serverUpdatedAt(serverNowMs);

  const ranking = useRankingQuery({ initialData: initialRanking, initialDataUpdatedAt });
  const mineInList = userId ? ranking.data?.find((s) => s.userId === userId) : undefined;
  // 목록에 내가 없을 때만 따로 받는다 — 있으면 같은 줄을 두 번 받을 이유가 없다
  const scoreUserId = ranking.isPending || mineInList ? undefined : userId;
  const myScore = useMyScoreQuery(scoreUserId, {
    // 서버가 본 사용자의 키에만 시드한다 — 계정이 바뀌었으면 새로 받는다
    initialData: scoreUserId !== undefined && scoreUserId === initialUserId ? initialMyScore : undefined,
    initialDataUpdatedAt,
  });

  const myRank = ((): MyRank => {
    if (!userId) return { state: "none" };
    if (mineInList) return { state: "ready", score: mineInList };
    if (ranking.isPending || myScore.isPending) return { state: "loading" };
    if (myScore.data) return { state: "ready", score: myScore.data };
    if (myScore.data === null) return { state: "empty" };
    return { state: "error", retry: () => myScore.refetch() };
  })();

  return { ranking, userId, myRank };
}
