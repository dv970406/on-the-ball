"use client";

import { useCallback, useEffect, useRef } from "react";
import type { CommentVote } from "@/entities/comment";
import { useSessionStore } from "@/entities/session";
import { useVoteComment } from "./use-vote-comment";

/**
 * 표 한 번을 보낸다 — 보냈으면 `true`. 세션 복원 중이거나 비로그인이면 보내지 않고 `false`다
 * (비로그인은 안내를 띄운다). 버튼은 `true`일 때만 "마지막으로 요청한 표"를 적어 둔다.
 */
export type CommentVoteFn = (commentId: number, current: CommentVote, next: CommentVote) => boolean;

/**
 * 댓글 목록 **하나가 한 벌** 드는 표 보내기 — 결과는 안정된 참조라 행마다 그대로 내려보낸다.
 *
 * ⚠ 표 버튼마다 `useVoteComment`(뮤테이션 옵저버)와 세션 구독을 두지 않는다 — 댓글 200개면 옵저버 200개 ·
 *   구독 400개가 되고, 그중 하나만 바뀌어도 행이 다시 그려진다. 낙관적 갱신·롤백·줄 끝 재동기화·실패 토스트는
 *   전부 **훅 레벨 콜백**이라 Mutation이 직접 부른다 — 옵저버 하나를 여러 댓글이 나눠 써도(호출마다 앞 mutation에서
 *   옵저버가 떨어져도) 그 의미가 그대로다(`use-item-guard.ts` 주석의 query-core 동작).
 * ⚠ 세션은 **누르는 순간에** 읽는다(`getState()`) — 렌더 때 구독한 값을 쓰지 않으니 행이 세션에 묶이지 않는다.
 *   `loading`을 비로그인처럼 다루지 않는 3분기는 그대로다.
 * ⚠ `onSignInRequired`는 ref로 읽는다 — 호출부가 인라인 화살표를 넘겨도 돌려주는 함수가 바뀌지 않는다
 *   (`reply-composer.tsx`의 `open`·`close`와 같은 형태).
 */
export function useCommentVote(dealId: number, onSignInRequired: () => void): CommentVoteFn {
  const { mutate } = useVoteComment(dealId);
  const signInRef = useRef(onSignInRequired);
  useEffect(() => {
    signInRef.current = onSignInRequired;
  });

  return useCallback<CommentVoteFn>(
    (commentId, current, next) => {
      const { status, user } = useSessionStore.getState();
      if (status === "loading") return false;
      if (status === "guest" || !user) {
        signInRef.current();
        return false;
      }
      mutate({ commentId, userId: user.id, current, next });
      return true;
    },
    [mutate],
  );
}
