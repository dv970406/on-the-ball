"use client";

import { useEffect, useRef } from "react";
import { type DealPrediction, latestVotedRound, myPickOf } from "@/entities/prediction";
import { useSessionStore } from "@/entities/session";
import { predictionRound, transferWindowByKey } from "@/shared/config";
import { usePredictDeal } from "./use-predict-deal";

interface UsePredictionChoiceArgs {
  dealId: number;
  settled: boolean;
  prediction: DealPrediction | undefined;
  userId: string | undefined;
  nowMs: number | null;
  onSignInRequired: (action: string) => void;
}

/**
 * 예측 카드의 회차·내 표·고르기 — 판정과 방어를 갖고, 무엇을 그릴지는 카드가 정한다.
 *
 * ⚠ **세션 `status`를 3분기한다**(`WatchToggle`과 같다) — `loading`에 비로그인 안내를 띄우면 복원 중인 로그인 사용자가 안내를 본다.
 * ⚠ **같은 tick의 연타를 prop으로 판정하지 않는다**(`CommentVoteButtons`와 같다) — 낙관적 갱신은 캐시를 곧바로 고치지만 `prediction` prop은 다음 렌더에야
 *   바뀌어, 그 사이 들어온 두 번째 클릭은 옛 표를 보고 같은 요청을 한 번 더 만든다. 마지막으로 요청한 표를 ref에 적어 두고 캐시가 따라오면 비운다.
 */
export function usePredictionChoice({ dealId, settled, prediction, userId, nowMs, onSignInRequired }: UsePredictionChoiceArgs) {
  const status = useSessionStore((s) => s.status);
  const predict = usePredictDeal(dealId);
  const requestedRef = useRef<boolean | null>(null);

  // 닫힌 딜은 표가 있는 마지막 회차를, 열린 딜은 지금 받는 회차를 그린다
  const round = settled
    ? (() => {
        const key = latestVotedRound(prediction);
        return key ? (transferWindowByKey(key) ?? { key, label: key }) : null;
      })()
    : nowMs === null
      ? null
      : predictionRound(nowMs);
  const pick = round ? myPickOf(prediction, round.key) : null;

  // 캐시가 따라오면(낙관적 갱신·롤백·재조회로 내 표가 바뀌면) 다시 캐시를 믿는다
  useEffect(() => {
    requestedRef.current = null;
  }, [pick]);
  // 요청이 끝나도 다시 캐시를 믿는다 — 캐시에 데이터가 없어 낙관적 갱신이 아무것도 고치지 못했으면(다른 탭에서 로그인한 새 키)
  // `pick`이 그대로라 위 effect가 돌지 않고, 같은 버튼이 "이미 골랐다"로 삼켜졌다
  useEffect(() => {
    if (!predict.isPending) requestedRef.current = null;
  }, [predict.isPending]);

  const choose = (next: boolean) => {
    if (!round || status === "loading") return;
    if (status === "guest" || !userId) {
      onSignInRequired("성사 여부를 예측하려면");
      return;
    }
    const current = requestedRef.current ?? pick;
    // 고른 것을 다시 누르면 아무 일도 하지 않는다(거두기가 없다)
    if (current === next) return;
    requestedRef.current = next;
    predict.mutate({ userId, roundKey: round.key, current, next });
  };

  return { status, round, pick, choose };
}
