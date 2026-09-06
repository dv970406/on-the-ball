"use client";

import { useDuplicateGuard, useToast } from "@/shared/lib";
import { type AdminMatchInput, useUnlockMatch, useUpdateMatch } from "@/features/admin-match";

/**
 * 경기 수정 제출 + 잠금 해제.
 *
 * ⚠ 가드가 여기 있는 이유는 이 자리가 **뮤테이션을 조립하는 쪽**이기 때문이다.
 *   `MatchForm`은 `isPending`을 prop으로 받으므로 가드를 들 수 없다(부모가 리렌더되기
 *   전까지 낡은 값을 읽어 첫 실패 이후 영영 제출할 수 없게 된다 — 실측).
 * ⚠ 성공해도 **화면을 떠나지 않는다** — 잠금이 걸렸다는 사실을 같은 화면에서 보여야 한다.
 *   그래서 훅의 무효화는 Promise를 반환하고, 리페치가 끝날 때까지 버튼이 잠긴다.
 */
export function useMatchEdit(matchId: number) {
  const update = useUpdateMatch(matchId);
  const unlock = useUnlockMatch();
  const guard = useDuplicateGuard(update);
  const unlockGuard = useDuplicateGuard(unlock);
  const toast = useToast();

  return {
    submit: (input: AdminMatchInput) => {
      if (guard.isLocked()) return;
      guard.lock();
      update.mutate(input, { onSuccess: () => toast("경기를 저장했어요") });
    },
    unlock: () => {
      if (unlockGuard.isLocked()) return;
      unlockGuard.lock();
      unlock.mutate(matchId, { onSuccess: () => toast("동기화 잠금을 풀었어요") });
    },
    isPending: update.isPending,
    isUnlocking: unlock.isPending,
    error: update.error,
  };
}
