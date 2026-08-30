"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { useToast } from "@/shared/lib";
import { type Poll, type PollResult, pollKeys } from "@/entities/poll";
import { useSessionStore } from "@/entities/session";

interface VoteSnapshot {
  poll: Poll | undefined;
  results: PollResult[] | undefined;
  /**
   * ⚠ **낙관값을 쓴 그 키를 그대로 들고 간다.** `useMutation`은 매 렌더 옵션을 교체하므로,
   *   왕복 중에 계정이 바뀌면 `onError`·`onSettled`가 **새 userId 키**를 보게 되어
   *   옛 키에 쓴 낙관값이 롤백되지 않은 채 남는다. 키를 context에 실으면 그 어긋남이 닫힌다.
   */
  keys: { detail: readonly unknown[]; results: readonly unknown[] };
}

/** 옛 선택 −1, 새 선택 +1. 처음 보는 선택지는 행을 만든다 */
function shifted(results: PollResult[], from: number | null, to: number): PollResult[] {
  const next = results
    .map((r) => (r.optionId === from ? { ...r, voteCount: r.voteCount - 1 } : r))
    .map((r) => (r.optionId === to ? { ...r, voteCount: r.voteCount + 1 } : r));
  const hasTo = next.some((r) => r.optionId === to);
  // 득표 0인 선택지는 집계에 행이 없다(group by라서) — 첫 표를 받으면 행이 생긴다
  return hasTo ? next : [...next, { optionId: to, voteCount: 1 }];
}

/**
 * 투표하기 / 갈아타기 — 단일 선택.
 *
 * ⚠ **RPC가 아니다.** 좋아요는 카운터 컬럼을 함께 움직여야 해서 잠금이 필요했지만,
 *   투표는 집계 컬럼이 없어 지킬 불변조건이 행 하나뿐이고 그 행은 `(post_id, user_id)`
 *   기본키가 이미 하나로 묶는다(사유는 마이그레이션 20260817000003 머리말).
 *
 * ⚠ **PostgREST upsert를 쓰지 않는다.** `ON CONFLICT DO UPDATE SET`에 payload의 모든 컬럼을
 *   실어 `post_id`·`user_id`에도 UPDATE 권한을 요구하는데(실측 42501), 그걸 열면 자기 표를
 *   다른 글로 옮겨 "취소 불가"를 우회할 수 있다. 그래서 **내 표가 있는지로 갈라** insert 또는
 *   `option_id`만 바꾸는 update를 보낸다. 컬럼 grant는 `option_id` 하나뿐이다.
 *
 * ⚠ **중복 실행 가드를 두지 않는다.** 낙관적 업데이트가 있고 결과가 멱등이다
 *   (연타해도 행이 늘지 않는다) — `data-and-state.md`의 판정표 그대로.
 */
export function useCastPollVote(postId: number) {
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.user?.id);
  const toast = useToast();

  return useMutation<void, Error, number, VoteSnapshot>({
    mutationFn: async (optionId: number) => {
      const supabase = requireBrowserSupabase();
      if (!userId) throw new Error("로그인이 필요해요.");

      // 캐시가 아니라 **서버에 물어** 분기한다 — 캐시가 낡아 있으면 insert가 23505로 죽는다.
      // 정책이 "내 행만"이라 이 조회는 남의 표를 볼 수 없다.
      const { data: mine, error: readError } = await supabase
        .from("post_poll_vote")
        .select("option_id")
        .eq("post_id", postId)
        .eq("user_id", userId)
        .maybeSingle();

      if (readError) {
        console.error("[poll] 내 표 조회 실패:", readError);
        throw new Error(toDbErrorMessage(readError));
      }

      const castVote = (existing: boolean) =>
        existing
          ? supabase
              .from("post_poll_vote")
              .update({ option_id: optionId })
              .eq("post_id", postId)
              .eq("user_id", userId)
              .select("option_id")
          : supabase
              .from("post_poll_vote")
              .insert({ post_id: postId, user_id: userId, option_id: optionId })
              .select("option_id");

      let { data, error } = await castVote(mine !== null);

      // ⚠ 다른 탭에서 먼저 투표하면 위 조회가 놓친 사이 행이 생겨 23505가 난다.
      //   그대로 두면 "이미 사용 중인 값이에요"라는 엉뚱한 문구가 나가므로 update로 재시도한다.
      if (error?.code === "23505") ({ data, error } = await castVote(true));

      if (error) {
        console.error("[poll] 투표 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      // RLS 위반은 에러가 아니라 0행이다 — "투표됐다"고 거짓말하지 않는다
      if (!data || data.length === 0) throw new Error("삭제된 글이거나 투표할 수 없어요.");
    },

    onMutate: async (optionId) => {
      const keys = {
        detail: pollKeys.detail(postId, userId),
        results: pollKeys.results(postId, userId),
      };
      await Promise.all([
        queryClient.cancelQueries({ queryKey: keys.detail }),
        queryClient.cancelQueries({ queryKey: keys.results }),
      ]);

      const snapshot: VoteSnapshot = {
        keys,
        poll: queryClient.getQueryData<Poll>(keys.detail),
        results: queryClient.getQueryData<PollResult[]>(keys.results),
      };

      // 같은 선택지를 다시 눌렀으면 화면이 바뀔 것이 없다(요청은 그대로 나가 멱등하게 끝난다)
      if (snapshot.poll?.myOptionId !== optionId) {
        queryClient.setQueryData<Poll>(keys.detail, (old) =>
          old ? { ...old, myOptionId: optionId } : old,
        );
        queryClient.setQueryData<PollResult[]>(keys.results, (old) =>
          // ⚠ 첫 투표에는 되돌릴 집계 자체가 없다(결과가 닫혀 있었다) — 그대로 두고
          //   onSettled의 리페치가 채우게 한다. 화면은 그 순간만 결과를 숨긴다.
          old ? shifted(old, snapshot.poll?.myOptionId ?? null, optionId) : old,
        );
      }

      return snapshot;
    },

    onError: (error, _optionId, snapshot) => {
      // 키는 낙관값을 쓴 그 시점의 것을 쓴다(위 VoteSnapshot 주석)
      const keys = snapshot?.keys;
      if (!keys) {
        toast(error.message);
        return;
      }
      queryClient.setQueryData(keys.detail, snapshot.poll);
      // ⚠ `setQueryData(key, undefined)`는 **아무 일도 하지 않는다**(query-core가 undefined를
      //   "갱신 없음"으로 읽는다). 스냅샷이 없었다는 건 그 캐시가 원래 없었다는 뜻이므로
      //   되돌리기가 아니라 제거가 맞다 — 안 그러면 실패한 투표의 흔적이 캐시에 눌러앉는다.
      if (snapshot.results) {
        queryClient.setQueryData(keys.results, snapshot.results);
      } else {
        queryClient.removeQueries({ queryKey: keys.results });
      }
      // 롤백은 선택 표시를 조용히 되돌릴 뿐이라, 알리지 않으면 **누른 적이 없는 것처럼 보인다**
      toast(error.message);
    },

    onSettled: (_data, _error, _optionId, snapshot) => {
      // ⚠ Promise를 반환하지 않는다 — 낙관적 업데이트가 이미 정답을 그려 놨는데
      //   리페치까지 isPending을 끌면 연타만 막혀 반응이 둔해진다(좋아요와 같은 규약).
      const keys = snapshot?.keys ?? {
        detail: pollKeys.detail(postId, userId),
        results: pollKeys.results(postId, userId),
      };
      queryClient.invalidateQueries({ queryKey: keys.detail });
      queryClient.invalidateQueries({ queryKey: keys.results });
    },
  });
}
