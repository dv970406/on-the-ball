"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toWriteErrorMessage } from "@/shared/api";
import { track, useToast } from "@/shared/lib";
import {
  applyVote,
  commentKeys,
  recordSettledVote,
  type CommentList,
  type CommentVote,
} from "@/entities/comment";
import { useSessionStore } from "@/entities/session";

export interface VoteCommentVariables {
  commentId: number;
  /**
   * 누른 사람 — 낙관적 갱신·롤백은 **이 사용자의 목록 캐시 하나만** 건드리고, 목록 조회는 같은 사용자의
   * 진행 중인 표만 덮는다(`applyPendingVotes`). 누른 뒤 계정이 바뀌면 요청을 보내지 않는다.
   */
  userId: string;
  /**
   * 누르기 직전의 내 표 — **어느 요청을 먼저 보낼지 고르는 힌트일 뿐이다.** 틀려도 결과는 `next`로
   *   수렴한다(아래 mutationFn의 폴백). 다른 탭에서 표를 바꿨거나 연타가 겹치면 실제로 틀린다.
   */
  current: CommentVote;
  /** 목표 상태 — 0이면 표를 거둔다 */
  next: CommentVote;
}

/**
 * 되돌릴 값 — **그 댓글의 누르기 직전 표 하나**다(목록 전체 스냅샷이 아니다).
 * ⚠ 목록 스냅샷으로 되돌리면 그 사이 새로 받은 목록(방금 등록한 댓글, 삭제 확인이 다시 센 답글 수)까지
 *   옛 목록으로 돌아간다(QA 실측 — 삭제 확인 문구가 0.3초 동안 "답글 0개"로 돌아가 확인이 열렸다).
 */
interface VoteRollback {
  prevVote: CommentVote;
}

/**
 * 서버 값으로 다시 받아야 하는 딜 — **그 딜의 표가 전부 끝난 뒤에** 한 번 다시 받는다(아래 `onSettled`).
 * 표 버튼마다 훅 인스턴스가 따로라 표시를 모듈에 둔다(같은 딜의 표는 `scope`로 한 줄이다).
 */
const needsResync = new Set<number>();

/**
 * 댓글 좋아요·싫어요 — "내 표를 `next`로 맞춘다".
 *
 * ⚠ **RPC가 없다.** 합계는 트리거가 단독으로 맞추고, 지킬 불변조건("1인 1표")은 복합 PK가 쥔다.
 *   클라이언트는 insert / update(value) / delete 중 하나를 보낸다(upsert는 키 컬럼 UPDATE 권한을
 *   요구해서 쓰지 않는다 — `api-and-db.md`).
 * ⚠ **어느 요청이든 목표 상태로 수렴한다** — insert가 23505(이미 표가 있다)면 값을 바꾸고,
 *   update가 0행(표가 없었다)이면 새로 던진다. delete 0행은 이미 목표 상태라 성공이다(멱등).
 * ⚠ **같은 딜의 표는 한 줄로 세운다**(`scope`). 연타로 insert와 delete가 동시에 날아가면 서버에
 *   도착하는 순서가 보장되지 않아 화면과 DB가 갈린다. `onMutate`(낙관적 갱신)는 줄을 서지 않고
 *   곧바로 돈다 — 기다리는 것은 네트워크뿐이다(query-core `Mutation.execute`).
 * ⚠ **가드도 `disabled`도 두지 않는다** — 낙관적 UI의 목적이 즉시 반응이고, 연타해도 행은 PK 하나다
 *   (관심 토글과 같은 판단 — `data-and-state.md` 가드 표).
 *
 * ## 조회와 겹칠 때 — 다시 받지 않고 **덮어 넣는다**
 * 표가 날아가는 동안이나 끝난 직후에 도착한 목록 조회는 표가 커밋되기 전의 DB를 읽었을 수 있다. 조회
 * 함수가 받은 결과에 **아직 끝나지 않은 표와 그 조회가 시작된 뒤 커밋된 표**를 다시 입힌다
 * (`applyPendingVotes` — 커밋된 표는 `onSuccess`의 `recordSettledVote`가 기억한다). 멱등이다.
 *
 * ## 재동기화 — **줄의 마지막 표가 끝날 때 한 번**(실패·0행일 때만)
 * 성공한 표는 리페치하지 않는다(`refetchType: "none"`) — 화면이 이미 정답을 그렸는데 리페치를 걸면
 * 표 한 번에 댓글 목록 전체(상한 `COMMENT_LIST_LIMIT`)가 다시 내려온다. 아래 둘 중 하나가 생기면 표시만 해 두고,
 * **그 딜의 표가 하나도 남지 않은 순간**(`isMutating === 1` — 자기 자신) 서버 값으로 다시 받는다.
 * ⚠ 그때는 진행 중인 조회가 있어도 **새로 받는다**(`cancelRefetch` 기본값) — 거두기 0행·23503은 "그 댓글이
 *   지워졌다"는 신호인데, 진행 중인 조회는 지워지기 전의 DB를 읽었을 수 있어 얹히면 유령 댓글이 남는다.
 *   재동기화는 실패·0행에만 걸리는 드문 경로라, 표를 누를 때마다 재조회가 늘던 문제(겹침 재조회 —
 *   지금은 위의 덮어 넣기로 대신한다)는 돌아오지 않는다.
 * 1. **실패** — 그 댓글의 표만 누르기 직전 값으로 되돌린다. 단 **같은 댓글에 뒤따라 줄 선 표가 있으면**
 *    되돌리지 않는다 — 그 표의 낙관적 갱신을 지우게 된다(QA 실측: 성공한 👎가 화면에서 사라졌다).
 *    그리고 곧바로 리페치하면 줄 선 쓰기가 커밋되기 전의 DB를 읽는다 → 줄이 빈 뒤에 받는다.
 * 2. **거두기가 0행** — 표가 이미 없었거나 **댓글 자체가 지워졌다.** 후자면 유령 댓글이 남는다.
 *
 * ⚠ **진행 중인 조회를 취소하지 않는다**(`cancelQueries` 없음). 흔한 낙관적 갱신 패턴이지만 여기서는
 *   댓글 등록·삭제가 건 리페치까지 되돌려서, 표를 몇 번 누르면 "등록했어요" 토스트가 뜬 뒤 1초 넘게
 *   새 댓글이 없었고(QA 실측), 되돌린 스냅샷이 이미 롤백한 표를 되살리기도 했다. 조회 결과는
 *   `applyPendingVotes`가 표를 덮어 넣는다(위 "조회와 겹칠 때").
 */
export function useVoteComment(dealId: number) {
  const queryClient = useQueryClient();
  const user = useSessionStore((s) => s.user);
  const toast = useToast();

  return useMutation<{ resync: boolean }, Error, VoteCommentVariables, VoteRollback>({
    mutationKey: commentKeys.voteMutation(dealId),
    scope: { id: `comment-vote:${dealId}` },
    mutationFn: async ({ commentId, userId, current, next }) => {
      const supabase = requireBrowserSupabase();
      // 누른 뒤 로그아웃·계정 전환이 끼면 다른 사람 명의로 보내지 않는다(RLS도 막지만 문구가 뭉개진다)
      if (!user || user.id !== userId) throw new Error("로그인이 필요해요.");
      const fail = async (error: unknown, what: string) => {
        console.error(`[comment-vote] ${what} 실패:`, error);
        return new Error(await toWriteErrorMessage(supabase, error));
      };

      if (next === 0) {
        const { data, error } = await supabase
          .from("transfer_deal_comment_vote")
          .delete()
          .eq("user_id", user.id)
          .eq("comment_id", commentId)
          .select("comment_id");
        if (error) throw await fail(error, "표 거두기");
        // 0행이어도 목표 상태라 성공이다 — 다만 댓글이 지워진 경우일 수 있어 다시 받는다(위 2)
        return { resync: data.length === 0 };
      }

      const insert = () =>
        supabase
          .from("transfer_deal_comment_vote")
          .insert({ user_id: user.id, comment_id: commentId, value: next });
      const update = () =>
        supabase
          .from("transfer_deal_comment_vote")
          .update({ value: next })
          .eq("user_id", user.id)
          .eq("comment_id", commentId)
          // ⚠ RLS·행 없음은 에러가 아니라 0행이다 — 영향 행을 받아 "표가 없었다"를 가린다
          .select("comment_id");

      if (current === 0) {
        const { error } = await insert();
        if (!error) return { resync: false };
        // ⚠ 이 409는 브라우저가 콘솔에 남긴다(앱이 억제할 수 없다) — 다른 탭·겹친 연타의 경합 경로다
        if (error.code !== "23505") throw await fail(error, "투표");
        // 이미 표가 있다 → 아래에서 값만 맞춘다
      }

      const { data, error } = await update();
      if (error) throw await fail(error, "표 바꾸기");
      if (data.length > 0) return { resync: false };

      // 표가 없었다(다른 탭에서 거뒀다) → 새로 던진다
      const { error: insertError } = await insert();
      if (insertError) throw await fail(insertError, "투표");
      return { resync: false };
    },

    onMutate: ({ commentId, userId, next }) => {
      /**
       * ⚠ **누른 사람의 목록 하나만** 읽고 고친다. 같은 딜의 다른 사용자 스코프(비로그인·이전 계정)
       *   캐시가 남아 있을 수 있는데, 거기에 내 표를 입히면 로그아웃 뒤 한 프레임 동안 내 표가 보이고
       *   롤백 기준값도 엉뚱한 캐시에서 읽힌다.
       */
      const key = commentKeys.list(dealId, userId);
      const prevVote =
        queryClient.getQueryData<CommentList>(key)?.comments.find((c) => c.id === commentId)?.myVote ?? 0;
      queryClient.setQueryData<CommentList>(key, (old) =>
        old ? applyVote(old, commentId, next) : old,
      );
      return { prevVote };
    },

    onSuccess: ({ resync }, { commentId, userId, next }) => {
      // 이 표보다 먼저 시작해 나중에 도착하는 조회가 이 표를 빠뜨려도 다시 입힐 수 있게 기억한다
      recordSettledVote(dealId, { commentId, userId, next });
      if (resync) needsResync.add(dealId);
      track("comment_vote", { deal_id: dealId, value: next });
    },

    onError: (error, { commentId, userId }, rollback) => {
      const key = commentKeys.list(dealId, userId);
      // 같은 댓글에 뒤따라 줄 선 표가 없을 때만 그 표 하나를 되돌린다(위 1). 자기 자신은 아직 pending이다
      const laterOnSameComment = queryClient
        .getMutationCache()
        .findAll({ mutationKey: commentKeys.voteMutation(dealId), status: "pending" })
        .filter((m) => (m.state.variables as VoteCommentVariables | undefined)?.commentId === commentId);
      if (rollback && laterOnSameComment.length <= 1) {
        queryClient.setQueryData<CommentList>(key, (old) =>
          old ? applyVote(old, commentId, rollback.prevVote) : old,
        );
      }
      needsResync.add(dealId);
      /**
       * 롤백은 버튼을 조용히 되돌릴 뿐이라, 알리지 않으면 **눌린 적이 없는 것처럼 보인다.**
       * ⚠ 단 그 댓글이 **이미 목록에 없으면** 알리지 않는다 — 방금 내가 지운 댓글에 날아가던 표가
       *   실패한 것이라, "삭제했어요" 뒤에 "대상을 찾을 수 없어요"가 뜨면 모순이다(QA 실측).
       *   남이 지운 댓글이면 아직 목록에 있어 알리고, 줄 끝 재동기화가 그 댓글을 걷어 낸다.
       */
      const stillListed = queryClient
        .getQueryData<CommentList>(key)
        ?.comments.some((c) => c.id === commentId);
      if (stillListed !== false) toast(error.message);
    },

    onSettled: () => {
      const scope = commentKeys.deal(dealId);
      // ⚠ 이 콜백이 도는 동안 자기 자신은 아직 pending이다(query-core는 콜백 뒤에 success를 dispatch한다)
      const last = queryClient.isMutating({ mutationKey: commentKeys.voteMutation(dealId) }) === 1;
      if (last && needsResync.delete(dealId)) {
        // 진행 중인 조회가 있어도 새로 받는다(위 ⚠ — 지워진 댓글이 유령으로 남지 않게)
        queryClient.invalidateQueries({ queryKey: scope });
        return;
      }
      queryClient.invalidateQueries({ queryKey: scope, refetchType: "none" });
    },
  });
}
