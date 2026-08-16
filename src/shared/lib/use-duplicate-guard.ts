"use client";

import { useEffect, useRef } from "react";

export interface DuplicateGuard {
  /** 이미 진행 중인가. **이벤트 핸들러 안에서만** 부른다(렌더 중 ref 읽기 금지) */
  isLocked: () => boolean;
  /** 잠근다. `isPending`이 false로 돌아오는 렌더에서 저절로 풀린다 */
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
 * ⚠ **잠근 뒤에는 반드시 `isPending`을 토글하는 뮤테이션을 시작해야 한다.** 시작하지 않으면
 *   자물쇠가 풀리지 않아 버튼은 활성인데 클릭만 삼켜지는 **무증상 잠금**이 된다.
 *   그래서 확인(`isLocked`)과 잠금(`lock`)이 **나뉘어 있다** — 사이에 끼는 검증이 실패하면
 *   잠그지 않고 빠져나가야 고쳐서 다시 누를 수 있다.
 *
 * ```ts
 * const guard = useDuplicateGuard(mutation.isPending);
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
 * 자리는 **그 뮤테이션을 소유한 훅**이다 — 호출부가 기억해야 하는 방어는 방어가 아니다.
 * 예외는 `PostForm`처럼 `onSubmit` prop만 받아 그것이 뮤테이션인지 모르는 폼이며,
 * 그때는 폼이 자기 제출을 방어하고 `isPending`을 prop으로 받아 해제 시점을 맞춘다.
 *
 * ⚠ 여러 행을 동시에 다루는 화면(목록의 항목별 삭제)은 boolean 하나로 부족하다 —
 *   가드가 키를 받아야 한다. 그 변형은 렌더 표시용 상태를 함께 갖기 때문에 **형태가 달라**
 *   이 훅에 합치지 않는다.
 */
export function useDuplicateGuard(isPending: boolean): DuplicateGuard {
  const lockedRef = useRef(false);

  // 뮤테이션이 끝나면(성공·실패 무관) 다시 열어준다
  useEffect(() => {
    if (!isPending) lockedRef.current = false;
  }, [isPending]);

  return {
    isLocked: () => lockedRef.current,
    lock: () => {
      lockedRef.current = true;
    },
  };
}
