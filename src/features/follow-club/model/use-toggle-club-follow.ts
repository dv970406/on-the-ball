"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toWriteErrorMessage } from "@/shared/api";
import { track, useToast } from "@/shared/lib";
import { useSessionStore } from "@/entities/session";
import { compareClubs, transferKeys, type TransferClub } from "@/entities/transfer";

export interface ToggleClubFollowVariables {
  club: TransferClub;
  /** 지금 응원 구단인가 — `true`면 풀고(delete), `false`면 고른다(insert) */
  following: boolean;
  /**
   * 누른 사람 — 낙관적 갱신·롤백이 **이 사용자의 캐시 하나만** 건드린다.
   * ⚠ 호출부가 넘긴다 — 훅이 렌더 시점의 세션을 캡처하면, 줄 서 있는 동안 계정이 바뀐 요청이 새 사용자의 캐시를 고친다.
   */
  userId: string;
}

/**
 * 줄 끝에서 서버 값으로 다시 맞춰야 하는 사용자 — 실패했거나 목록이 낡았다는 신호(이미 있던 행 · 지울 행 없음)가
 * 있었던 줄만 다시 받는다.
 * ⚠ **성공한 요청마다 다시 받지 않는다**(`data-and-state.md`) — 낙관적 갱신이 이미 정답을 그렸고, 구단을 하나씩
 *   고르는 동안 누른 수만큼 조회가 나간다. 성공한 줄은 stale로만 찍어 다음 마운트에 최신화한다.
 */
const needsResync = new Set<string>();

/** 목록에 목표 상태를 입힌다 — 멱등이다(이미 그 상태면 그대로). 조회와 같은 순서(`compareClubs`)로 끼워 넣는다 */
function applyFollow(list: TransferClub[], club: TransferClub, follow: boolean): TransferClub[] {
  const without = list.filter((c) => c.code !== club.code);
  return follow ? [...without, club].sort(compareClubs) : without;
}

/**
 * 응원 구단 토글 — `transfer_club_follow`에 행 하나를 만들거나 지운다.
 *
 * ⚠ **RPC가 없다.** 카운터가 없어 지킬 불변조건이 행 하나뿐이고, 그 행은 `(user_id, club_code)` 기본키가 이미 묶는다
 *   (관심 토글과 같은 판단 — `api-and-db.md`).
 * ⚠ **세션 확인은 이중 방어다.** 실제 차단은 RLS(`insert_own`·`delete_own`, `to authenticated`)가 한다.
 * ⚠ 이미 고른 구단을 다시 고르는 것(23505)은 **성공으로 흡수한다** — 목표 상태에 이미 도달했다(멱등).
 *
 * 낙관적 업데이트 — 고르는 화면에서 여러 구단을 잇달아 누르는 자리라 댓글 표와 같은 규약을 쓴다(`data-and-state.md`):
 * - **요청을 한 줄로 세운다**(`scope`). 동시에 날아가면 서버 도착 순서가 보장되지 않는다. `onMutate`는 줄을 서지 않아 반응은 즉시다.
 * - **실패는 그 구단 하나만 되돌린다.** 목록 스냅샷으로 되돌리면 그 사이 누른 다른 구단까지 옛 상태가 된다.
 * - **재동기화는 실패·낡은 목록 신호가 있었을 때만, 줄 끝에서 한 번이다.** 줄 선 쓰기가 남아 있을 때 다시 받으면 커밋되기 전의 DB를
 *   읽어 방금 누른 구단이 되돌아가고, 성공할 때마다 다시 받으면 누른 수만큼 조회가 는다.
 * ⚠ 가드도 `disabled`도 없다 — 연타해도 행은 PK 하나뿐이고, 목적이 즉시 반응이다.
 * ⚠ 성공 토스트를 내지 않는다 — 누른 줄의 체크가 곧 성공 표시이고, 여러 구단을 고르는 동안 토스트가 줄줄이 뜬다.
 *   실패는 언제나 토스트로 보낸다(앱의 유일한 알림 채널).
 */
export function useToggleClubFollow() {
  const queryClient = useQueryClient();
  const toast = useToast();

  // 결과값은 "행이 실제로 바뀌었는가"다 — 이미 목표 상태였던 요청(23505 흡수 · 지울 행 없음)은 성공이지만 바뀐 것이 없다
  return useMutation<boolean, Error, ToggleClubFollowVariables>({
    mutationKey: transferKeys.followMutation(),
    scope: { id: "transfer-club-follow" },

    mutationFn: async ({ club, following, userId }) => {
      const supabase = requireBrowserSupabase();
      // ⚠ 세션은 **실행하는 순간에** 읽는다(렌더 때 구독한 값이 아니다) — 줄 서 있는 동안 로그아웃·계정 전환이
      //   일어났으면 옛 사용자의 요청을 새 세션으로 보내지 않는다. RLS도 그 요청을 거부하지만 문구가 "권한 없음"이 된다.
      const current = useSessionStore.getState().user;
      if (!current || current.id !== userId) throw new Error("로그인이 필요해요.");

      if (following) {
        const { data, error } = await supabase
          .from("transfer_club_follow")
          .delete()
          .eq("user_id", userId)
          .eq("club_code", club.code)
          .select("club_code");
        if (error) {
          console.error("[club-follow] 응원 구단 해제 실패:", error);
          throw new Error(await toWriteErrorMessage(supabase, error));
        }
        // ⚠ RLS 위반·행 없음은 에러가 아니라 0행이다 — "이미 풀려 있음"도 목표 상태라 실패로 올리지 않는다(멱등).
        //   다만 지울 행이 없었다는 것은 **이 화면의 목록이 낡았다**는 신호다(다른 탭·기기에서 바꿨다) → 줄 끝에서 다시 받는다
        if (data.length === 0) needsResync.add(userId);
        return data.length > 0;
      }

      const { error } = await supabase
        .from("transfer_club_follow")
        .insert({ user_id: userId, club_code: club.code });
      if (error && error.code !== "23505") {
        console.error("[club-follow] 응원 구단 등록 실패:", error);
        throw new Error(await toWriteErrorMessage(supabase, error));
      }
      // 이미 있던 행(23505)도 같은 신호다 — 목표 상태라 성공이지만 목록은 낡았다
      if (error) needsResync.add(userId);
      return !error;
    },

    onMutate: async ({ club, following, userId }) => {
      const key = transferKeys.follows(userId);
      // 진행 중인 조회가 낙관적 값을 덮지 못하게 한다 — 줄 끝의 재동기화가 다시 받는다
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<TransferClub[]>(key, (old) =>
        old ? applyFollow(old, club, !following) : old,
      );
    },

    onSuccess: (changed, { club, following }) => {
      // 바뀐 것이 없는 요청은 세지 않는다(다른 탭에서 이미 고른 구단을 또 고른 경우)
      if (changed) track("club_follow", { club_code: club.code, following: !following });
    },

    onError: (error, { club, following, userId }) => {
      // 줄 서 있는 동안 그 사용자가 떠났다(로그아웃·계정 전환) — 되돌릴 캐시도, 알릴 사람도 없다. 여기서 토스트를 내면
      // 로그아웃해서 옮겨 간 화면에 "로그인이 필요해요"가 뜬다(방금 스스로 로그아웃한 사람에게).
      if (useSessionStore.getState().user?.id !== userId) return;
      // 그 구단 하나만 누르기 전 상태로 — 같은 구단에 뒤따라 줄 선 요청이 있으면 그 낙관적 값을 지우므로 두고 줄 끝에 맡긴다
      const laterOnSameClub = queryClient
        .getMutationCache()
        .findAll({ mutationKey: transferKeys.followMutation(), status: "pending" })
        .filter((m) => (m.state.variables as ToggleClubFollowVariables | undefined)?.club.code === club.code);
      if (laterOnSameClub.length <= 1) {
        queryClient.setQueryData<TransferClub[]>(transferKeys.follows(userId), (old) =>
          old ? applyFollow(old, club, following) : old,
        );
      }
      needsResync.add(userId);
      // 롤백은 체크를 조용히 되돌릴 뿐이라, 알리지 않으면 눌린 적이 없는 것처럼 보인다
      toast(error.message);
    },

    onSettled: (_data, _error, { userId }) => {
      // ⚠ 이 콜백이 도는 동안 자기 자신은 아직 pending이다(query-core는 콜백 뒤에 결과를 dispatch한다)
      const last = queryClient.isMutating({ mutationKey: transferKeys.followMutation() }) === 1;
      const key = transferKeys.follows(userId);
      if (last && needsResync.delete(userId)) {
        queryClient.invalidateQueries({ queryKey: key });
        return;
      }
      queryClient.invalidateQueries({ queryKey: key, refetchType: "none" });
    },
  });
}
