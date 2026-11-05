import type { QueryClient } from "@tanstack/react-query";
import { createPendingOverlay } from "@/shared/lib";
import { applyPick } from "../lib/tally";
import type { DealPrediction, PickMutationVariables } from "../model/types";
import { predictionKeys } from "./keys";

/*
 * 조회 결과에 **아직 반영되지 않았을 수 있는 내 예측**을 다시 입힌다(`createPendingOverlay`). 뮤테이션 캐시를 읽으므로
 * 순수 계산(`lib/tally`)과 갈라 `api/`에 둔다. 조회(`queries.ts`)와 예측 훅이 쓴다.
 */

function isPickVariables(v: unknown): v is PickMutationVariables {
  if (typeof v !== "object" || v === null) return false;
  const { userId, roundKey, next } = v as Partial<Record<keyof PickMutationVariables, unknown>>;
  return typeof userId === "string" && typeof roundKey === "string" && typeof next === "boolean";
}

const overlay = createPendingOverlay<DealPrediction, PickMutationVariables>({
  isEntry: isPickVariables,
  apply: (prediction, pick) => applyPick(prediction, pick.roundKey, pick.next),
});

/** 방금 받은 예측에 아직 끝나지 않은 내 표와 이 조회가 시작된 뒤 커밋된 내 표를 입힌다. 비로그인 키에는 아무것도 입히지 않는다 */
export function applyPendingPicks(
  prediction: DealPrediction,
  queryClient: QueryClient,
  dealId: number,
  userId: string | undefined,
  /** 이 조회가 요청을 보낸 시각(`performance.now()`) */
  fetchStartedAt: number,
): DealPrediction {
  const pending = queryClient.getMutationCache().findAll({ mutationKey: predictionKeys.predictMutation(dealId), status: "pending" });
  return overlay.applyTo(prediction, pending, dealId, userId, fetchStartedAt);
}

/** 예측 훅의 `onSuccess`만 부른다(실패한 표는 커밋되지 않았다) */
export function recordSettledPick(dealId: number, pick: PickMutationVariables) {
  overlay.record(dealId, pick);
}
