"use client";

import { useItemGuard, useToast } from "@/shared/lib";
import { useUnblockUser } from "@/features/block-user";

/**
 * 차단 해제 — 목록의 **항목별** 실행이라 boolean 하나로는 부족하다(`useItemGuard`).
 *
 * ⚠ **`useUnlinkIdentity`의 boolean 전역 잠금을 흉내 내지 않는다.** 그쪽이 전역인 이유는
 *   지켜야 하는 것이 "이 항목이 두 번 지워지지 않는다"가 아니라 **"로그인 수단이 0개가 되지
 *   않는다"** 였기 때문이다. 차단 목록에는 그런 불변조건이 없다(0개가 정상 상태다).
 */
export function useBlockRemoval() {
  const unblock = useUnblockUser();
  const toast = useToast();
  const guard = useItemGuard<string>();

  const remove = (userId: string, nickname: string) =>
    guard.run(userId, () =>
      unblock.mutateAsync(userId).then(() => toast(`${nickname}님 차단을 해제했어요`)),
    );

  return { remove, isRemoving: guard.isBusy, error: unblock.error };
}
