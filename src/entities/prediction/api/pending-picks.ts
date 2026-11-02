import type { QueryClient } from "@tanstack/react-query";
import { applyPick } from "../lib/tally";
import type { DealPrediction } from "../model/types";
import { predictionKeys } from "./keys";

/*
 * 조회 결과에 **아직 반영되지 않았을 수 있는 내 예측**을 다시 입힌다 — 댓글 표의 `applyPendingVotes`와 같은 장치다.
 * 뮤테이션 캐시와 모듈 상태를 읽으므로 순수 계산(`lib/tally`)과 갈라 `api/`에 둔다. 조회(`queries.ts`)와 예측 훅이 쓴다.
 */

function isPickVariables(v: unknown): v is { userId: string; roundKey: string; next: boolean } {
  if (typeof v !== "object" || v === null) return false;
  const { userId, roundKey, next } = v as { userId?: unknown; roundKey?: unknown; next?: unknown };
  return typeof userId === "string" && typeof roundKey === "string" && typeof next === "boolean";
}

/**
 * 방금 받은 예측에 **아직 끝나지 않은 내 표**와 **이 조회가 시작된 뒤 커밋된 내 표**를 입힌다.
 *
 * ⚠ 표가 날아가는 동안의 조회(뒤로가기로 돌아온 상세의 재조회 · 재시도 · 세션 이벤트의 무효화)는 표가 커밋되기 전의 DB를 읽어
 *   **방금 누른 표를 되돌린다** — 성공해도 재조회하지 않으므로(`refetchType: "none"`) 다음 마운트까지 안 누른 상태로 남았다.
 *   표는 조회를 취소하지 않는다 — 데이터가 없는 첫 조회를 되돌리며 취소하면 카드가 데이터 없이 멈춘다. 조회 결과를 캐시에
 *   넣기 전에 여기서 덮는다. `applyPick`이 멱등이라 응답이 이미 반영했으면 그대로다.
 * ⚠ **이 키의 주인이 누른 표만** 입힌다(`userId`) — 뮤테이션 캐시는 사용자와 무관하다. 비로그인 키에는 아무것도 입히지 않는다.
 */
export function applyPendingPicks(
  prediction: DealPrediction,
  queryClient: QueryClient,
  dealId: number,
  userId: string | undefined,
  /** 이 조회가 요청을 보낸 시각(`performance.now()`) */
  fetchStartedAt: number,
): DealPrediction {
  if (!userId) return prediction;
  const settled = (settledPicks.get(dealId) ?? []).filter(
    (p) => p.userId === userId && p.committedAt > fetchStartedAt,
  );
  const withSettled = settled.reduce((acc, p) => applyPick(acc, p.roundKey, p.next), prediction);
  const pending = queryClient
    .getMutationCache()
    .findAll({ mutationKey: predictionKeys.predictMutation(dealId), status: "pending" })
    .sort((a, b) => a.mutationId - b.mutationId);
  return pending.reduce((acc, mutation) => {
    const vars = mutation.state.variables;
    return isPickVariables(vars) && vars.userId === userId ? applyPick(acc, vars.roundKey, vars.next) : acc;
  }, withSettled);
}

/** 커밋된 표를 기억하는 기간 — 어떤 조회도 이보다 오래 걸리지 않는다(넉넉히) */
const SETTLED_TTL_MS = 60_000;

interface SettledPick {
  userId: string;
  roundKey: string;
  next: boolean;
  /** 성공 응답을 받은 시각(단조 시계) — 실제 커밋보다 늦으므로 "조회 뒤 커밋"을 넉넉히(멱등이라 안전하게) 잡는다 */
  committedAt: number;
}

/** 딜별로 방금 커밋된 내 표 — 표보다 먼저 시작해 표가 끝난 뒤 도착한 조회에 다시 입힌다(이미 pending이 아니라 위 덮기가 못 본다) */
const settledPicks = new Map<number, SettledPick[]>();

/** 예측 훅의 `onSuccess`만 부른다(실패한 표는 커밋되지 않았다) */
export function recordSettledPick(dealId: number, pick: Omit<SettledPick, "committedAt">) {
  // ⚠ 단조 시계 — 조회의 시작 시각(`performance.now()`)과 같은 축이어야 비교가 성립한다
  const now = performance.now();
  const kept = (settledPicks.get(dealId) ?? []).filter((p) => now - p.committedAt < SETTLED_TTL_MS);
  kept.push({ ...pick, committedAt: now });
  settledPicks.set(dealId, kept);
}
