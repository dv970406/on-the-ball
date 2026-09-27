"use client";

import { useRef, useState } from "react";

export interface ItemGuard<K> {
  /**
   * 그 항목이 아직 처리 중이 아니면 잠그고 `task`를 실행한다. 끝나면(성공·실패 무관) 푼다.
   * 이미 처리 중이면 아무 일도 하지 않는다 — **이벤트 핸들러 안에서** 부른다.
   *
   * ⚠ `task`는 그 항목의 **뮤테이션 promise**를 돌려준다(`mutateAsync(id).then(토스트)`).
   *   실패는 여기서 삼킨다 — 문구는 훅 레벨 `onError`가 이미 토스트로 보냈다.
   */
  run: (id: K, task: () => Promise<unknown>) => void;
  /** 그 항목이 처리 중인가 — **렌더 중에 부른다**(버튼 라벨·disabled) */
  isBusy: (id: K) => boolean;
}

/**
 * 목록의 **항목별** 중복 실행 가드 — `useDuplicateGuard`(boolean 전역 잠금)의 키 있는 변형.
 *
 * ⚠ **boolean 하나로는 부족한 자리다.** 뮤테이션 훅이 하나뿐이라 다른 항목을 누르는 순간
 *   `variables`가 갈아타 처리 중이던 항목의 버튼이 되살아난다(`isPending`도 마지막 호출
 *   하나만 반영한다) → 보낸 id의 **집합**을 기억한다.
 *
 * ⚠ **동기 판정용 `ref`와 렌더 표시용 `state`를 따로 둔다.** ref는 렌더 중에 읽을 수 없고
 *   리렌더를 유발하지도 않으며, state는 비동기라 같은 tick의 두 번째 클릭을 못 막는다.
 *   해제는 **둘을 함께** 지운다 — 한쪽만 지우면 실패해서 남은 id가 다른 항목을 지우는 동안
 *   엉뚱한 버튼을 잠근다(실측 2.5초). 이 쌍을 호출부마다 다시 짜지 않으려고 훅이 순서를 갖는다.
 *
 * ⚠ **해제를 `mutate`의 per-call 콜백에 걸지 않는다.** `MutationObserver.mutate`는 호출마다
 *   옵션을 덮어쓰고 **이전 mutation에서 옵저버를 떼어낸다**(query-core 5.101). 그래서 A가 처리
 *   중일 때 B를 누르면 A의 per-call 콜백이 영영 실행되지 않아, A가 실패해 목록에 남으면 **버튼은
 *   활성인데 눌러도 아무 일이 없는 무증상 잠금**이 된다. `mutateAsync`가 돌려주는 promise는
 *   그 호출의 mutation에 묶여 있어 통지와 무관하게 끝나므로 `.finally()`가 항목별로 확실히 도착한다.
 *   훅 레벨 콜백(무효화·실패 토스트)은 Mutation이 직접 부르므로 옵저버 분리와 무관하게 돈다.
 *
 * ⚠ **effect로 풀지 않는다.** `isPending`(boolean)은 마이크로태스크만으로 끝나는 실패에서
 *   `false → false`라 아예 돌지 않는다(`use-duplicate-guard.ts`와 같은 함정).
 *
 * ⚠ 렌더 표시(`isBusy`)는 **집합만으로** 판정한다. `isPending`을 함께 보면 A가 날아가는 중에
 *   B가 끝나는 순간 A의 "…중"이 먼저 꺼진다. 혹시 해제를 놓치면 "…중"이 남아 **조용한 잠금
 *   대신 눈에 보이는 증상**이 된다.
 *
 * ⚠ **"항목 수 자체가 불변조건인 목록"에는 쓰지 않는다** — 로그인 수단 해제(`useUnlinkIdentity`)는
 *   "목록이 0개가 되지 않는다"를 지켜야 해서 항목별 가드로는 부족하다(boolean 전역 잠금이 맞다).
 *
 * ```ts
 * const guard = useItemGuard<number>();
 * const remove = (id: number) =>
 *   guard.run(id, () => deleteItem.mutateAsync(id).then(() => toast("삭제했어요")));
 * // 렌더: disabled={guard.isBusy(id)}
 * ```
 */
export function useItemGuard<K>(): ItemGuard<K> {
  const sentRef = useRef<Set<K>>(new Set());
  const [sentIds, setSentIds] = useState<ReadonlySet<K>>(new Set());

  const release = (id: K) => {
    sentRef.current.delete(id);
    setSentIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  return {
    run: (id, task) => {
      if (sentRef.current.has(id)) return;
      sentRef.current.add(id);
      setSentIds((prev) => new Set(prev).add(id));
      task()
        .catch(() => {})
        .finally(() => release(id));
    },
    isBusy: (id) => sentIds.has(id),
  };
}
