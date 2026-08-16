"use client";

import { useEffect, useState, type AnimationEvent } from "react";

/**
 * 퇴장 애니메이션이 끝날 때까지 DOM에 남겨 두는 마운트 상태기계.
 *
 * `Sheet` 전용 구현 세부사항이라 **배럴에 노출하지 않는다**(`use-sheet-drag.ts`와 같은 배치).
 *
 * ⚠ prop 변화에 따른 상태 조정은 **렌더 중**에 한다(React 공식 "adjusting state when a prop
 *   changes"). effect에 두면 커밋 후 재렌더가 한 번 더 도는 cascading render가 되어 린트가 막는다.
 *
 * ⚠ **폴백 타이머가 반드시 필요하다.** 애니메이션은 탭이 백그라운드면 멈추고, 그 상태에서
 *   닫으면 `animationend`가 오지 않아 **요소가 DOM에 남는다**(실측). 언마운트를 이벤트에만
 *   걸어 두면 화면이 잠긴 것처럼 보이는 상태가 만들어진다.
 *
 * ⚠ 그래서 퇴장 애니메이션에 `motion-safe:`를 붙이면 안 된다 — reduce 환경에서 클래스 자체가
 *   사라져 이벤트가 오지 않는다. globals.css의 전역 reduce 블록이 duration을 눌러 주므로
 *   접두어 없이 써야 정상 발화한다.
 *
 * @param open 열림 상태
 * @param fallbackMs 이벤트가 오지 않을 때 강제로 언마운트할 시간. **퇴장 duration의 두 배**로
 *   잡는다 — duration을 바꾸면 이 값도 함께 옮긴다.
 */
export function useExitTransition(open: boolean, fallbackMs: number) {
  /** DOM에 남아 있는가 — open이 false가 된 뒤에도 퇴장 애니메이션 동안 true */
  const [visible, setVisible] = useState(open);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setVisible(true);
  }

  useEffect(() => {
    if (open || !visible) return;
    const timer = setTimeout(() => setVisible(false), fallbackMs);
    return () => clearTimeout(timer);
  }, [open, visible, fallbackMs]);

  const closing = !open;

  return {
    mounted: visible,
    closing,
    /** 애니메이션을 지는 요소에 붙인다 — 자식 애니메이션의 버블링과 섞이지 않게 대상을 확인한다 */
    onAnimationEnd: (event: AnimationEvent<HTMLElement>) => {
      if (event.target === event.currentTarget && closing) setVisible(false);
    },
  };
}
