"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent, RefObject } from "react";

/** 스와이프 닫기 임계값 — 이 둘 중 큰 값을 넘겨야 닫힌다 */
const DISMISS_MIN_PX = 80;
const DISMISS_RATIO = 0.25;
/** 이만큼 움직였으면 탭이 아니라 드래그다 — 끌었다 되돌린 뒤 따라오는 click을 닫기로 오인하지 않게 */
const TAP_SLOP_PX = 4;

interface SheetDragOptions {
  /** 시트가 열려 있는가 — false가 되면 드래그 상태를 버린다 */
  active: boolean;
  /** 임계값 계산용 시트 높이 */
  sheetRef: RefObject<HTMLElement | null>;
  /** 오프셋이 실리는 안쪽 래퍼 — 스냅백 도중 실제 위치를 읽는다 */
  panelRef: RefObject<HTMLElement | null>;
  /** 스와이프로 임계값을 넘겼을 때 · 그래버를 탭했을 때 둘 다 부른다 */
  onDismiss: () => void;
}

/**
 * 바텀시트의 그래버 제스처 — 아래로 끌어 닫기 + 탭해서 닫기.
 * `Sheet` 전용 구현 세부사항이라 **배럴에 노출하지 않는다**(architecture.md).
 *
 * 반환하는 `grabberProps`는 그래버 밴드에 그대로 펼친다. 그 밴드는 드래그 핸들이자
 * 닫기 버튼이라 핸들러가 한 묶음인 것이 자연스럽다.
 *
 * ⚠ Vercel `rerender-use-ref-transient-values`(빈번한 값은 state 대신 ref)를 **알고 적용하지 않았다.**
 *   `dragY`를 ref+DOM 직접 조작으로 바꾸면 드래그 중 리렌더가 0이 되지만, 이 시트는
 *   `children`이 같은 참조라 재조정이 이미 저렴하고 실측 버벅임도 없었다. 반면 아래 두 동작이
 *   렌더된 위치에 의존해 얽혀 있어(스냅백 중 이어잡기 · 퇴장 애니메이션이 드래그 위치에서 이어짐)
 *   회귀 위험이 이득보다 크다고 판단했다. 드래그가 무거워지면 그때 옮긴다.
 */
export function useSheetDrag({ active, sheetRef, panelRef, onDismiss }: SheetDragOptions) {
  const [dragY, setDragY] = useState(0);
  /** 스냅백 구간에만 transition을 켠다(드래그 중에는 손가락을 그대로 따라가야 한다) */
  const [snapping, setSnapping] = useState(false);
  const [prevActive, setPrevActive] = useState(active);
  const dragRef = useRef<{ id: number; startY: number } | null>(null);
  /** 직전 포인터 조작이 드래그였는가 — 그래버의 click을 닫기로 볼지 가른다 */
  const draggedRef = useRef(false);

  // prop 변화에 따른 상태 조정은 **렌더 중**에 한다(React 공식 "adjusting state when a prop changes").
  // effect에 두면 커밋 후 재렌더가 한 번 더 도는 cascading render가 되어 린트가 막는다.
  if (active !== prevActive) {
    setPrevActive(active);
    // 스와이프로 닫은 시트를 다시 열 때 지난 오프셋이 남아 있으면 안 된다
    if (active) {
      setDragY(0);
      setSnapping(false);
    }
  }

  /**
   * 닫힐 때 드래그 상태를 확실히 버린다.
   * ⚠ 드래그 도중 Escape로 닫으면 **`pointerup`이 사라진 노드로 가서 영영 오지 않는다.**
   *   그러면 `dragRef`가 남고, 마우스는 `pointerId`가 늘 1이라 다음에 시트를 열었을 때
   *   **누르지 않은 hover만으로 시트가 끌려 내려갔다**(실측 재현). 아래 `hasPointerCapture`
   *   가드와 **둘 다** 둔다 — 캡처가 풀리는 경로가 하나가 아니다.
   */
  useEffect(() => {
    if (active) return;
    dragRef.current = null;
    draggedRef.current = false;
  }, [active]);

  const snapBack = () => {
    setSnapping(true);
    setDragY(0);
  };

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    // 스냅백 트랜지션 도중 다시 잡으면 `dragY`는 이미 0이라 그 자리에서 원위치로 튄다.
    // 실제로 그려지고 있는 위치를 읽어 이어 잡는다.
    const rendered = panelRef.current
      ? new DOMMatrixReadOnly(getComputedStyle(panelRef.current).transform).m42
      : 0;
    dragRef.current = { id: event.pointerId, startY: event.clientY - rendered };
    draggedRef.current = false;
    setSnapping(false);
    setDragY(rendered);
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (drag?.id !== event.pointerId) return;
    // ⚠ id 대조만으로는 부족하다 — **마우스는 pointerId가 늘 같아서**, pointerup 없이 끝난
    //   조작(드래그 중 Escape로 닫힘 등)의 잔재가 남으면 다음에 시트를 열었을 때
    //   버튼을 누르지 않은 이동만으로 시트가 끌려간다. 캡처 보유 여부가 진짜 판별자다.
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;

    // 위로는 늘어나지 않는다 — 올려 여는 시트가 아니다
    const offset = Math.max(0, event.clientY - drag.startY);
    if (offset > TAP_SLOP_PX) draggedRef.current = true;
    setDragY(offset);
  };

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (drag?.id !== event.pointerId) return;
    dragRef.current = null;

    const offset = Math.max(0, event.clientY - drag.startY);
    const height = sheetRef.current?.offsetHeight ?? 0;
    if (offset > Math.max(DISMISS_MIN_PX, height * DISMISS_RATIO)) {
      // dragY를 되돌리지 않는다 — 퇴장 애니메이션이 이 위치에서 이어진다(sheet.tsx 주석)
      onDismiss();
      return;
    }
    snapBack();
  };

  /**
   * ⚠ cancel은 **취소**다 — 마지막 좌표가 임계값을 넘었더라도 닫지 않고 되돌린다.
   * up과 한 핸들러로 묶으면 시스템 제스처가 가로챈 조작이 "닫기"로 해석된다.
   */
  const handlePointerCancel = (event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.id !== event.pointerId) return;
    dragRef.current = null;
    snapBack();
  };

  /** 그래버는 드래그 핸들이자 닫기 버튼이다. 끌었다 되돌린 뒤에도 click은 오므로 걸러낸다 */
  const handleClick = () => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    onDismiss();
  };

  return {
    dragY,
    snapping,
    grabberProps: {
      onClick: handleClick,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      // 캡처가 풀리면 남은 드래그 상태를 버린다(위 hasPointerCapture 주석과 한 쌍)
      onLostPointerCapture: () => {
        dragRef.current = null;
      },
    },
  };
}
