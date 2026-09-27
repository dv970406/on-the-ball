import type { CommentList, CommentVote } from "../model/types";

/**
 * 목록 속 댓글 하나에 목표 표를 입힌다 — 합계는 **목록이 들고 있는 내 표**를 기준으로 고친다.
 * 이미 그 표면 그대로 돌려준다(멱등) — 서버가 이미 반영한 표에 다시 입혀도 숫자가 두 번 움직이지 않는다.
 * ⚠ `fetchedVote`는 건드리지 않는다 — 인기순이 "이번에 누른 변화분"을 빼는 기준이다(`sortThreads`).
 */
export function applyVote(list: CommentList, commentId: number, next: CommentVote): CommentList {
  return {
    ...list,
    comments: list.comments.map((c) => {
      if (c.id !== commentId || c.myVote === next) return c;
      return {
        ...c,
        myVote: next,
        upCount: c.upCount - Number(c.myVote === 1) + Number(next === 1),
        downCount: c.downCount - Number(c.myVote === -1) + Number(next === -1),
      };
    }),
  };
}

/**
 * 목록에서 **내 표만** 지운다(합계는 그대로 — 서버 사실이다). 다른 사용자로 그린 목록을 잠시 보여 줄 때 쓴다.
 */
export function withoutMyVotes(list: CommentList): CommentList {
  return {
    ...list,
    comments: list.comments.map((c) =>
      c.myVote === 0 && c.fetchedVote === 0 ? c : { ...c, myVote: 0, fetchedVote: 0 },
    ),
  };
}
