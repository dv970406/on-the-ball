import type { QueryClient } from "@tanstack/react-query";
import { applyVote } from "../lib/apply-vote";
import type { CommentList, CommentVote } from "../model/types";
import { commentKeys } from "./keys";

/*
 * 조회 결과에 **아직 반영되지 않았을 수 있는 내 표**를 다시 입힌다 — 뮤테이션 캐시와 모듈 상태를 읽으므로
 * 순수 계산(`lib/apply-vote`)과 갈라 `api/`에 둔다. 목록 조회(`queries.ts`)와 표 훅이 쓴다.
 */

function isVoteVariables(
  v: unknown,
): v is { commentId: number; userId: string; next: CommentVote } {
  if (typeof v !== "object" || v === null) return false;
  const { commentId, userId, next } = v as { commentId?: unknown; userId?: unknown; next?: unknown };
  return (
    typeof commentId === "number" &&
    typeof userId === "string" &&
    (next === 1 || next === -1 || next === 0)
  );
}

/**
 * 방금 받은 목록에 **아직 끝나지 않은 내 표**를 다시 입힌다.
 *
 * ⚠ 표 요청이 날아가는 동안 목록을 다시 받으면(댓글 등록·삭제 뒤, 삭제 확인의 답글 수 재확인, 재시도)
 *   그 조회는 표가 커밋되기 전의 DB를 읽어 **방금 누른 표를 되돌린다**(QA 실측 — 느린 회선에서 1초 동안
 *   표가 취소된 것처럼 보였다). 표는 조회를 취소하지 않는다(취소하면 쓰기 뒤 리페치까지 되돌린다 —
 *   `use-vote-comment` 주석) → 조회 결과를 캐시에 넣기 전에 여기서 덮는다. 받은 쪽이 이미 반영했으면 `applyVote`가
 *   멱등이라 그대로다. 줄 선(대기 중) 표도 pending이라 함께 입힌다 — 곧 그대로 커밋된다.
 *   실패한 표는 이미 pending이 아니고, 실패 복구는 표 훅의 줄 끝 재동기화가 맡는다.
 * ⚠ **방금 커밋된 표**도 입힌다 — 조회가 표보다 먼저 시작해 표가 끝난 뒤 도착하면 응답에 빠져 있다
 *   (`recordSettledVote`). 둘 다 `applyVote`라 응답이 이미 반영했으면 그대로다.
 * ⚠ **이 목록의 주인이 누른 표만** 입힌다(`userId`). 뮤테이션 캐시는 사용자와 무관해서, 표가 날아가는
 *   중에 로그아웃하면 비로그인 목록에 이전 사용자의 표가 입혀져 버튼이 켜지고 합계가 두 번 셌다.
 *   비로그인 목록(`userId` 없음)에는 아무것도 입히지 않는다.
 */
export function applyPendingVotes(
  list: CommentList,
  queryClient: QueryClient,
  dealId: number,
  userId: string | undefined,
  /** 이 조회가 요청을 보낸 시각(`performance.now()`) — 그 뒤에 커밋된 표는 응답에 빠져 있을 수 있다 */
  fetchStartedAt: number,
): CommentList {
  if (!userId) return list;
  // 1) 이 조회가 시작된 뒤 커밋된 표 — 조회가 커밋 전의 DB를 읽었을 수 있다(커밋 순서대로)
  const settled = (settledVotes.get(dealId) ?? []).filter(
    (v) => v.userId === userId && v.committedAt > fetchStartedAt,
  );
  const withSettled = settled.reduce((acc, v) => applyVote(acc, v.commentId, v.next), list);
  // 2) 아직 끝나지 않은 표 — 곧 그대로 커밋된다(누른 순서대로, 같은 댓글이면 마지막 표가 남는다)
  const pending = queryClient
    .getMutationCache()
    .findAll({ mutationKey: commentKeys.voteMutation(dealId), status: "pending" })
    .sort((a, b) => a.mutationId - b.mutationId);
  return pending.reduce((acc, mutation) => {
    const vars = mutation.state.variables;
    return isVoteVariables(vars) && vars.userId === userId
      ? applyVote(acc, vars.commentId, vars.next)
      : acc;
  }, withSettled);
}

/** 커밋된 표를 기억하는 기간 — 어떤 조회도 이보다 오래 걸리지 않는다(넉넉히) */
const SETTLED_TTL_MS = 60_000;

interface SettledVote {
  commentId: number;
  userId: string;
  next: CommentVote;
  /** 성공 응답을 받은 시각(단조 시계) — 실제 커밋보다 늦으므로 "조회 뒤 커밋"을 넉넉히(멱등이라 안전하게) 잡는다 */
  committedAt: number;
}

/**
 * 딜별로 **방금 커밋된 내 표** — 표보다 먼저 시작해 표가 끝난 뒤 도착한 조회에 다시 입힌다.
 *
 * ⚠ 이게 없으면 그런 조회가 표를 되돌린 채 남는다(표는 이미 pending이 아니라 위 2)가 못 덮는다). 전에는
 *   "조회와 겹치면 줄 끝에서 다시 받기"로 메웠는데, 그 재조회가 진행 중인 조회를 취소·재시작해서 표를
 *   누를 때마다 목록 GET이 늘고 쓰기 뒤 토스트가 목록보다 먼저 떴다(QA 실측 — 8번 누르면 GET 12회).
 * ⚠ 표 훅의 `onSuccess`만 부른다(실패한 표는 기억하지 않는다 — 커밋되지 않았다).
 */
const settledVotes = new Map<number, SettledVote[]>();

export function recordSettledVote(dealId: number, vote: Omit<SettledVote, "committedAt">) {
  // ⚠ 단조 시계 — 조회의 시작 시각(`performance.now()`)과 같은 축이어야 비교가 성립한다
  const now = performance.now();
  const kept = (settledVotes.get(dealId) ?? []).filter((v) => now - v.committedAt < SETTLED_TTL_MS);
  kept.push({ ...vote, committedAt: now });
  settledVotes.set(dealId, kept);
}
