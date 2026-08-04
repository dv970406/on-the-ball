"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 모달·시트용 포커스 트랩 + Escape 닫힘 + 트리거로 포커스 복귀.
 *
 * ⚠ native `<dialog showModal>`을 쓰지 않는 이유: top-layer로 올라가 루트 layout의
 *   430px 모바일 프레임 **바깥**에 그려진다. 프로토타입의 시트·다이얼로그는 프레임 안쪽에
 *   absolute로 얹히는 물건이라 형태가 달라진다.
 *
 * ⚠ Escape는 keydown에서 잡는다(keyup이면 다른 핸들러가 먼저 먹는다).
 *   스크림 클릭과 Escape 모두 **취소**로 처리해야 한다 — 파괴적 액션이 기본값이 되면 안 된다.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!active) return;

    const container = containerRef.current;
    // 닫힐 때 돌아갈 자리 — 열기 직전 포커스를 갖고 있던 요소
    const trigger = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // 열리면 첫 항목으로 포커스를 옮긴다(없으면 컨테이너 자신 — tabIndex=-1을 붙여 둔다)
    (focusables()[0] ?? container)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && (current === first || !container?.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // 트리거가 아직 문서에 있을 때만 되돌린다(글 삭제처럼 트리거째 사라지는 경우가 있다)
      if (trigger?.isConnected) trigger.focus();
    };
  }, [containerRef, active, onClose]);
}
