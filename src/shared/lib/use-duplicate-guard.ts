"use client";

import { useEffect, useRef } from "react";

/**
 * 가드가 읽는 뮤테이션의 최소 형태 — TanStack `useMutation`의 반환값이 그대로 들어맞는다.
 *
 * ⚠ **`isPending`(boolean)을 받지 않는 이유가 이 훅의 핵심이다.** 아래 해제 절 참고.
 */
export interface GuardedMutation {
  status: "idle" | "pending" | "success" | "error";
  /** 시도할 때마다 새로 찍히는 시각. 같은 결과가 연속돼도 이 값이 달라진다 */
  submittedAt: number;
}

export interface DuplicateGuard {
  /** 이미 진행 중인가. **이벤트 핸들러 안에서만** 부른다(렌더 중 ref 읽기 금지) */
  isLocked: () => boolean;
  /** 잠근다. 뮤테이션이 끝나는 렌더에서 저절로 풀린다 */
  lock: () => void;
}

/**
 * 렌더를 기다리지 않는 중복 실행 가드.
 *
 * ⚠ **`disabled={isPending}`는 중복 실행을 막지 못한다.** `isPending`은 **렌더 이후에야** DOM에
 *   반영되는데 TanStack Query의 상태 변경은 마이크로태스크로 배치된다. 그래서 첫 클릭과 거의
 *   동시에 들어온 두 번째 클릭은 아직 enabled인 버튼을 누른다 — 실측에서 3연타에 **같은 글이
 *   3개 생성**됐다. ref는 렌더를 기다리지 않으므로 같은 tick의 연타도 막는다.
 *   `disabled`는 시각 표시로만 남긴다.
 *
 * ⚠ **확인(`isLocked`)과 잠금(`lock`)이 나뉜 것이 규약이다.** 사이에 끼는 검증이 실패하면
 *   잠그지 않고 빠져나가야 고쳐서 다시 누를 수 있다.
 *
 * ## 해제를 `status`+`submittedAt`에 거는 이유
 *
 * 전에는 `useEffect(..., [isPending])`로 풀었는데, **자물쇠가 영영 풀리지 않는 경로가 있었다**
 * (실측: 실패 후 글 등록 3회 클릭 → 요청 1건, 새로고침이 유일한 탈출구).
 *
 * query-core는 구독자 통지를 `setTimeout(0)`에 싣는다(`notifyManager`). 그래서 뮤테이션이
 * **매크로태스크 없이 마이크로태스크만으로 실패**하면(동기 `throw` — `requireBrowserSupabase()`나
 * `if (!user) throw`) 첫 리렌더가 이미 `isPending: false`라 deps가 `false → false`가 되어
 * **해제 effect가 한 번도 실행되지 않는다.** boolean은 "아직 시작 전"과 "이미 끝남"을
 * 구분하지 못한다.
 *
 * `status`는 그 둘을 구분하고(`idle` ≠ `error`), `submittedAt`은 **시도마다 달라져** 같은 실패가
 * 연속될 때도(`error → error`) deps를 움직인다. 둘을 함께 봐야 닫힌다.
 *
 * ⚠ **`isPending`을 prop으로 내려받는 컴포넌트에 가드를 두지 않는다.** 부모가 리렌더되기
 *   전까지 자식은 낡은 값을 다시 읽을 뿐이라, 자식이 아무리 setState해도 해제 신호가 오지 않는다.
 *   가드는 **뮤테이션을 소유·조립하는 쪽**에 둔다(`PostForm`이 아니라 `PostWriteView`).
 *
 * ```ts
 * const guard = useDuplicateGuard(mutation);
 *
 * const handleSubmit = (e: FormEvent) => {
 *   e.preventDefault();
 *   if (guard.isLocked()) return;
 *
 *   const message = validate(value);
 *   if (message) return setError(message); // 잠그지 않는다
 *
 *   guard.lock();
 *   mutation.mutate(value);
 * };
 * ```
 *
 * 어느 뮤테이션에 두는지는 `docs/conventions/data-and-state.md`의 표가 정한다
 * (판단 기준: "연타하면 되돌릴 수 없는 결과가 남는가").
 *
 * ⚠ 여러 행을 동시에 다루는 화면(목록의 항목별 삭제)은 boolean 하나로 부족하다 —
 *   가드가 키를 받아야 한다. 그 변형은 렌더 표시용 상태를 함께 갖기 때문에 **형태가 달라**
 *   이 훅에 합치지 않는다(선례 `useCommentDeletion`).
 */
export function useDuplicateGuard({ status, submittedAt }: GuardedMutation): DuplicateGuard {
  const lockedRef = useRef(false);

  // 뮤테이션이 끝나면(성공·실패 무관) 다시 열어준다.
  // submittedAt이 deps에 있어야 같은 결과가 연속될 때도 이 effect가 돈다.
  useEffect(() => {
    if (status !== "pending") lockedRef.current = false;
  }, [status, submittedAt]);

  return {
    isLocked: () => lockedRef.current,
    lock: () => {
      lockedRef.current = true;
    },
  };
}
