"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toWriteErrorMessage } from "@/shared/api";
import { track, useToast } from "@/shared/lib";
import { applyPick, myPickOf, predictionKeys, type DealPrediction } from "@/entities/prediction";
import { useSessionStore } from "@/entities/session";

export interface PredictDealVariables {
  /**
   * 누른 사람 — 낙관적 갱신·롤백은 **이 사용자의 캐시 하나만** 건드린다(내 표가 "내 행만"이라 키가 사용자별이다).
   * 누른 뒤 계정이 바뀌면 요청을 보내지 않는다.
   */
  userId: string;
  /**
   * 화면이 그리는 회차(`predictionRound`) — 낙관적 갱신의 자리이고, 바꾸기(UPDATE)가 이 회차의 행을 찾는다.
   * ⚠ **저장되는 회차는 DB 트리거가 정한다** — 마감 순간에 갈려도 저장값은 DB의 것이고 다음 조회가 맞춘다.
   */
  roundKey: string;
  /** 목표 — true 성사 · false 불발. 거두기는 없다(DB에 DELETE 경로가 없다) */
  next: boolean;
}

/**
 * 서버 값으로 다시 받아야 하는 딜 — **그 딜의 예측이 전부 끝난 뒤에** 한 번 다시 받는다(아래 `onSettled`).
 * 카드가 다시 마운트돼도 표시가 남게 모듈에 둔다(댓글 표의 `needsResync`와 같은 장치).
 */
const needsResync = new Set<number>();

/**
 * 딜 성사 예측 — "이 회차의 내 표를 `next`로 맞춘다".
 *
 * ⚠ **RPC가 없다.** 집계는 definer 트리거가 단독으로 맞추고, "한 창에 한 표"는 복합 PK가 쥔다. 회차·시각은 INSERT
 *   트리거가 정하고, 마감된 회차·결과가 나온 딜은 트리거가 P0001로 막는다(문구가 그대로 토스트로 나간다).
 * ⚠ **어느 요청이든 목표 상태로 수렴한다** — 처음이면 insert, 23505(이미 표가 있다 — 다른 탭)면 값만 바꾸고,
 *   바꾸기가 0행(행이 없었다)이면 새로 넣는다(`useVoteComment`와 같은 형태).
 * ⚠ **같은 딜의 예측은 한 줄로 세운다**(`scope`) — 첫 표의 insert와 곧바로 바꾼 update가 동시에 날아가면 도착 순서가
 *   보장되지 않는다. 낙관적 갱신은 줄을 서지 않고 곧바로 돈다.
 * ⚠ **가드도 `disabled`도 두지 않는다** — 낙관적 UI이고, 연타해도 행은 PK 하나다(관심 토글과 같은 판단).
 * ⚠ 성공 토스트를 내지 않는다 — 고르는 순간 버튼이 눌리고 비율이 열리는 것이 곧 확인이다.
 *
 * 재동기화는 실패했을 때만, **줄의 마지막 요청이 끝날 때** 한 번이다 — 성공한 요청마다 다시 받지 않는다(화면이 이미
 * 정답을 그렸다). 남의 표로 바뀐 집계는 다음 마운트에 따라온다(stale 표시).
 */
export function usePredictDeal(dealId: number) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<void, Error, PredictDealVariables, { prevPick: boolean | null }>({
    mutationKey: predictionKeys.predictMutation(dealId),
    scope: { id: `predict-deal:${dealId}` },
    mutationFn: async ({ userId, roundKey, next }) => {
      const supabase = requireBrowserSupabase();
      // ⚠ 세션은 **실행하는 순간에** 읽는다 — 줄 서 있는 동안 로그아웃·계정 전환이 끼면 다른 명의로 보내지 않는다
      const user = useSessionStore.getState().user;
      if (!user || user.id !== userId) throw new Error("로그인이 필요해요.");
      const fail = async (error: unknown, what: string) => {
        console.error(`[predict-deal] ${what} 실패:`, error);
        return new Error(await toWriteErrorMessage(supabase, error));
      };

      const insert = () =>
        supabase.from("transfer_deal_prediction").insert({ user_id: user.id, deal_id: dealId, will_happen: next });
      const update = () =>
        supabase
          .from("transfer_deal_prediction")
          .update({ will_happen: next })
          .eq("user_id", user.id)
          .eq("deal_id", dealId)
          .eq("round_key", roundKey)
          // ⚠ RLS·행 없음은 에러가 아니라 0행이다 — 영향 행을 받아 "표가 없었다"를 가린다
          .select("deal_id");

      // 처음 고르는 것인지는 **캐시의 내 표**로 판정한다 — 틀려도 아래 폴백이 목표 상태로 수렴시킨다
      const cached = queryClient.getQueryData<DealPrediction>(predictionKeys.deal(dealId, userId));
      if (myPickOf(cached, roundKey) === null) {
        const { error } = await insert();
        if (!error) return;
        if (error.code !== "23505") throw await fail(error, "예측");
        // 이미 표가 있다(다른 탭) → 값만 맞춘다
      }

      const { data, error } = await update();
      if (error) throw await fail(error, "예측 바꾸기");
      if (data.length > 0) return;

      // 표가 없었다(회차가 바뀌었다 — 창이 막 닫혔다) → 새로 넣는다. 회차는 트리거가 정한다
      const { error: insertError } = await insert();
      if (insertError) throw await fail(insertError, "예측");
    },

    onMutate: ({ userId, roundKey, next }) => {
      const key = predictionKeys.deal(dealId, userId);
      const prevPick = myPickOf(queryClient.getQueryData<DealPrediction>(key), roundKey);
      queryClient.setQueryData<DealPrediction>(key, (old) => (old ? applyPick(old, roundKey, next) : old));
      return { prevPick };
    },

    onSuccess: (_data, { next }) => {
      track("deal_predict", { deal_id: dealId, will_happen: next });
    },

    onError: (error, { userId, roundKey }, rollback) => {
      // 같은 딜에 뒤따라 줄 선 요청이 없을 때만 누르기 직전 값으로 되돌린다(자기 자신은 아직 pending이다) —
      // 있으면 그 요청의 낙관적 갱신을 지우게 된다. 어느 쪽이든 줄 끝에서 서버 값으로 맞춘다.
      const pending = queryClient.isMutating({ mutationKey: predictionKeys.predictMutation(dealId) });
      if (rollback && pending <= 1) {
        queryClient.setQueryData<DealPrediction>(predictionKeys.deal(dealId, userId), (old) =>
          old ? applyPick(old, roundKey, rollback.prevPick) : old,
        );
      }
      needsResync.add(dealId);
      // 롤백은 버튼을 조용히 되돌릴 뿐이라 알리지 않으면 눌린 적이 없는 것처럼 보인다
      toast(error.message);
    },

    onSettled: () => {
      const scope = predictionKeys.dealAll(dealId);
      // ⚠ 이 콜백이 도는 동안 자기 자신은 아직 pending이다
      const last = queryClient.isMutating({ mutationKey: predictionKeys.predictMutation(dealId) }) === 1;
      if (last && needsResync.delete(dealId)) {
        queryClient.invalidateQueries({ queryKey: scope });
        return;
      }
      queryClient.invalidateQueries({ queryKey: scope, refetchType: "none" });
    },
  });
}
