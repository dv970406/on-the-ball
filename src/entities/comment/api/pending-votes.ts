import type { QueryClient } from "@tanstack/react-query";
import { createPendingOverlay } from "@/shared/lib";
import { applyVote } from "../lib/apply-vote";
import type { CommentList, CommentVote, VoteMutationVariables } from "../model/types";
import { commentKeys } from "./keys";

/*
 * 조회 결과에 **아직 반영되지 않았을 수 있는 내 표**를 다시 입힌다(`createPendingOverlay`). 뮤테이션 캐시를 읽으므로
 * 순수 계산(`lib/apply-vote`)과 갈라 `api/`에 둔다. 목록 조회(`queries.ts`)와 표 훅이 쓴다.
 */

function isVoteVariables(v: unknown): v is VoteMutationVariables {
  if (typeof v !== "object" || v === null) return false;
  const { commentId, userId, next } = v as Partial<Record<keyof VoteMutationVariables, unknown>>;
  return typeof commentId === "number" && typeof userId === "string" && (next === 1 || next === -1 || next === (0 satisfies CommentVote));
}

const overlay = createPendingOverlay<CommentList, VoteMutationVariables>({
  isEntry: isVoteVariables,
  apply: (list, vote) => applyVote(list, vote.commentId, vote.next),
});

/** 방금 받은 목록에 아직 끝나지 않은 내 표와 이 조회가 시작된 뒤 커밋된 내 표를 입힌다. 비로그인 목록(`userId` 없음)에는 아무것도 입히지 않는다 */
export function applyPendingVotes(
  list: CommentList,
  queryClient: QueryClient,
  dealId: number,
  userId: string | undefined,
  /** 이 조회가 요청을 보낸 시각(`performance.now()`) */
  fetchStartedAt: number,
): CommentList {
  const pending = queryClient.getMutationCache().findAll({ mutationKey: commentKeys.voteMutation(dealId), status: "pending" });
  return overlay.applyTo(list, pending, dealId, userId, fetchStartedAt);
}

/** 표 훅의 `onSuccess`만 부른다(실패한 표는 커밋되지 않았다) */
export function recordSettledVote(dealId: number, vote: VoteMutationVariables) {
  overlay.record(dealId, vote);
}
