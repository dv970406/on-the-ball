"use client";

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { requireBrowserSupabase, toWriteErrorMessage } from "@/shared/api";
import { useToast } from "@/shared/lib";
import { useSessionStore } from "@/entities/session";
import { transferKeys, type TransferDeal, type TransferDealListItem } from "@/entities/transfer";

export interface ToggleWatchVariables {
  dealId: number;
  /** 지금 관심 상태 — `true`면 빼고(delete), `false`면 담는다(insert) */
  watched: boolean;
}

/**
 * 롤백용 스냅샷 — 목록은 범위·유저 조합마다, 상세는 유저마다 키가 달라 **여러 개**다. 전부 담는다.
 * (그래서 setQueryData가 아니라 setQueriesData를 쓴다)
 */
interface WatchSnapshot {
  lists: [QueryKey, TransferDealListItem[] | undefined][];
  details: [QueryKey, TransferDeal | null | undefined][];
}

/** 관심 상태를 뒤집은 사본 — 목록 항목·상세 모두 같은 필드(`isWatched`)를 쓴다 */
function toggled<T extends Pick<TransferDeal, "id" | "isWatched">>(deal: T, dealId: number): T {
  if (deal.id !== dealId) return deal;
  return { ...deal, isWatched: !deal.isWatched };
}

/**
 * 관심 토글 — `transfer_deal_watch`에 행 하나를 만들거나 지운다.
 *
 * ⚠ **RPC가 없다.** 카운터가 없어 지킬 불변조건이 행 하나뿐이고, 그 행은 `(user_id, deal_id)`
 *   기본키가 이미 하나로 묶는다(insert/delete 직접).
 * ⚠ **`if (!user) throw`는 이중 방어다.** 실제 차단은 RLS(`insert_own`·`delete_own`,
 *   `to authenticated`)가 한다. 비로그인은 `WatchToggle`이 로그인 안내로 보낸다.
 * ⚠ 이미 담긴 딜을 다시 담는 것(23505)은 **성공으로 흡수한다** — 목표 상태에 이미 도달했으므로
 *   멱등이 맞다. 그대로 흘리면 `toDbErrorMessage`가 닉네임 문구("이미 사용 중인 값이에요.")로
 *   접어 엉뚱한 말이 나간다(`api-and-db.md`의 "설명과 흡수" 표).
 *
 * 낙관적 업데이트: onMutate(취소+스냅샷) → onError(롤백) → onSettled(재동기화).
 * ⚠ **목록은 `refetchType: "none"`** — `onMutate`가 이미 정답(`isWatched`)을 그려 놨는데 활성
 *   리페치를 걸면 토글 한 번에 목록 상한(`TRANSFER_DEAL_LIMIT`)만큼의 딜 행 + 임베딩 조회가 나간다. stale로만 찍어 두면 다음
 *   마운트(뒤로가기·탭 전환)에 최신화된다. 상세는 한 건이라 즉시 리페치한다.
 * ⚠ 무효화 Promise를 **반환하지 않는다** — 반환하면 리페치가 끝날 때까지 `isPending`이 유지되는데
 *   화면은 이미 정답을 보여주고 있어 연타만 막혀 반응이 둔해진다(`data-and-state.md` 표).
 * ⚠ 성공 토스트는 **여기**(훅의 `onSuccess`)가 낸다 — 호출부마다 기억해야 하는 문구는 방어가 아니다.
 */
export function useToggleTransferWatch() {
  const queryClient = useQueryClient();
  const user = useSessionStore((s) => s.user);
  const toast = useToast();

  return useMutation<void, Error, ToggleWatchVariables, WatchSnapshot>({
    mutationFn: async ({ dealId, watched }) => {
      const supabase = requireBrowserSupabase();
      if (!user) throw new Error("로그인이 필요해요.");

      if (watched) {
        const { error } = await supabase
          .from("transfer_deal_watch")
          .delete()
          .eq("user_id", user.id)
          .eq("deal_id", dealId);
        // ⚠ RLS 위반은 에러가 아니라 0행이다 — 다만 여기서는 "이미 빠져 있음"도 목표 상태라
        //   0행을 실패로 승격하지 않는다(멱등).
        if (error) {
          console.error("[transfer-watch] 관심 해제 실패:", error);
          throw new Error(await toWriteErrorMessage(supabase, error));
        }
        return;
      }

      const { error } = await supabase
        .from("transfer_deal_watch")
        .insert({ user_id: user.id, deal_id: dealId });
      if (error && error.code !== "23505") {
        console.error("[transfer-watch] 관심 등록 실패:", error);
        throw new Error(await toWriteErrorMessage(supabase, error));
      }
    },

    onMutate: async ({ dealId }) => {
      // 진행 중인 리페치가 낙관적 값을 덮어쓰지 못하게 먼저 취소한다
      await queryClient.cancelQueries({ queryKey: transferKeys.all });

      const snapshot: WatchSnapshot = {
        lists: queryClient.getQueriesData<TransferDealListItem[]>({
          queryKey: transferKeys.lists(),
        }),
        details: queryClient.getQueriesData<TransferDeal | null>({
          queryKey: transferKeys.details(),
        }),
      };

      // setQueryData가 아니라 setQueriesData(복수형) — 캐시가 여러 키에 존재할 수 있다
      queryClient.setQueriesData<TransferDealListItem[]>({ queryKey: transferKeys.lists() }, (old) =>
        old ? old.map((deal) => toggled(deal, dealId)) : old,
      );
      queryClient.setQueriesData<TransferDeal | null>({ queryKey: transferKeys.details() }, (old) =>
        old ? toggled(old, dealId) : old,
      );

      return snapshot;
    },

    onSuccess: (_data, { watched }) => {
      toast(watched ? "관심 목록에서 뺐어요" : "관심 목록에 담았어요");
    },

    onError: (error, _vars, snapshot) => {
      snapshot?.lists.forEach(([key, value]) => queryClient.setQueryData(key, value));
      snapshot?.details.forEach(([key, value]) => queryClient.setQueryData(key, value));
      // 롤백은 버튼을 조용히 되돌릴 뿐이라, 알리지 않으면 **눌린 적이 없는 것처럼 보인다** →
      // 앱의 유일한 알림 채널로 보낸다(`code-quality.md` — 뮤테이션 실패는 `onError`에서 토스트)
      toast(error.message);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: transferKeys.lists(), refetchType: "none" });
      queryClient.invalidateQueries({ queryKey: transferKeys.details() });
    },
  });
}
