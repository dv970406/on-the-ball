"use client";

import { useRef, useState } from "react";
import { useToast } from "@/shared/lib";
import { useUnblockUser } from "@/features/block-user";

/**
 * 차단 해제 — 목록의 **항목별** 실행이라 boolean 하나로는 부족하다.
 *
 * ⚠ 뮤테이션 훅이 하나뿐이라 다른 항목을 누르는 순간 `variables`가 갈아타, 처리 중이던 항목의
 *   버튼이 되살아난다 → 보낸 id의 **집합**을 기억한다(`useCommentDeletion`과 같은 형태).
 *
 * ⚠ 동기 판정용 `ref`와 렌더 표시용 `state`를 **따로** 둔다. ref는 렌더 중에 읽을 수 없고
 *   리렌더를 유발하지도 않으며, state는 비동기라 같은 tick의 두 번째 클릭을 못 막는다.
 *   해제는 per-call 콜백에서 **둘을 함께** 지운다 — 한쪽만 지우면 실패해서 남은 id가
 *   다른 항목을 지우는 동안 엉뚱한 버튼을 잠근다.
 *
 * ⚠ **`useUnlinkIdentity`의 boolean 전역 잠금을 흉내 내지 않는다.** 그쪽이 전역인 이유는
 *   지켜야 하는 것이 "이 항목이 두 번 지워지지 않는다"가 아니라 **"로그인 수단이 0개가 되지
 *   않는다"** 였기 때문이다. 차단 목록에는 그런 불변조건이 없다(0개가 정상 상태다).
 */
export function useBlockRemoval() {
  const unblock = useUnblockUser();
  const toast = useToast();

  const sentRef = useRef<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<ReadonlySet<string>>(new Set());

  const release = (userId: string) => {
    sentRef.current.delete(userId);
    setSentIds((prev) => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
  };

  const remove = (userId: string, nickname: string) => {
    if (sentRef.current.has(userId)) return;
    sentRef.current.add(userId);
    setSentIds((prev) => new Set(prev).add(userId));

    /**
     * ⚠ **해제를 per-call 콜백(`mutate`의 두 번째 인자)에 걸지 않는다.**
     *   `MutationObserver.mutate`는 호출마다 `#mutateOptions`를 덮어쓰고 **이전 mutation에서
     *   옵저버를 떼어낸다**(query-core 5.101 `mutationObserver.js`: removeObserver → addObserver).
     *   그래서 A가 처리 중일 때 B를 누르면 **A의 per-call 콜백이 영영 실행되지 않는다.**
     *   A가 네트워크 오류로 실패해 목록에 남아 있으면 `sentRef`에서 A가 지워지지 않아
     *   **버튼은 활성인데 눌러도 아무 일이 없는 무증상 잠금**이 된다(실측 소스 확인).
     *
     *   `mutateAsync`가 돌려주는 promise는 **그 호출의 mutation에 묶여 있어** 통지와 무관하게
     *   끝나므로 항목별 해제가 유실되지 않는다. 훅 레벨 콜백(무효화·실패 토스트)은 Mutation이
     *   직접 부르므로 옵저버 분리와 무관하게 그대로 돈다 — 그래서 catch는 삼키기만 한다.
     */
    unblock
      .mutateAsync(userId)
      .then(() => toast(`${nickname}님 차단을 해제했어요`))
      .catch(() => {})
      .finally(() => release(userId));
  };

  /**
   * 이 항목의 해제가 진행 중인가 — **렌더 중에 부르므로 state를 읽는다.**
   * `sentRef`를 읽으면 변경이 리렌더를 유발하지 않아 "해제 중…"이 영영 뜨지 않는다.
   *
   * ⚠ `unblock.isPending`을 **함께 보지 않는다.** 그 값은 마지막 호출 하나만 반영하므로,
   *   A가 아직 날아가는 중에 B가 끝나면 A의 표시가 먼저 꺼진다. 위 `finally`가 항목별로
   *   확실히 비워 주므로 집합만으로 정확하고, 혹시 비우지 못하면 "해제 중…"이 남아
   *   **조용한 잠금 대신 눈에 보이는 증상**이 된다.
   */
  const isRemoving = (userId: string) => sentIds.has(userId);

  return { remove, isRemoving, error: unblock.error };
}
