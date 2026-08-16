"use client";

import { useRef } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn, useFocusTrap } from "@/shared/lib";
import { Icon } from "./icon";
import { useExitTransition } from "./use-exit-transition";
import { useSheetDrag } from "./use-sheet-drag";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** 스크린리더가 읽을 시트의 이름 — 시각적으로는 감춘다 */
  label: string;
  children: ReactNode;
}

/**
 * 하단 바텀시트 — 화면 하단에 **붙는**(좌·우·하단 여백 0) edge-to-edge 형태.
 * 오버플로 메뉴(···)에 쓴다.
 *
 * 루트 layout의 430px 프레임이 `relative`+`overflow-hidden`이라 absolute가 프레임 안쪽에 얹히고,
 * 퇴장 애니메이션으로 프레임 밖까지 내려간 부분은 프레임이 잘라 준다.
 * 스크림은 불투명 `ink/50` — 블러를 쓰지 않는다(blur는 하단 탭바에서만 허용).
 *
 * ⚠ **애니메이션(바깥)과 드래그 transform(안쪽)을 다른 요소에 둔다.**
 *   CSS animation은 캐스케이드에서 inline style을 이기므로(fill-mode `both`가 끝난 뒤에도
 *   최종 transform을 계속 적용한다) 한 요소에 겹치면 드래그가 통째로 무시된다.
 *   덤으로 드래그 dismiss가 점프 없이 이어진다 — 손가락이 120px 내려간 상태에서 퇴장이
 *   시작되면 바깥이 0→100%를 도는 동안 안쪽은 +120px에 머물러 첫 프레임 위치가 손가락과 같다.
 *
 * ⚠ 퇴장 애니메이션에 `motion-safe:`를 붙이지 않는다. reduce 환경에서 클래스 자체가 사라져
 *   `animationend`가 오지 않고 **시트가 화면에 남는다.** globals.css의 전역 reduce 블록이
 *   duration을 0.01ms로 눌러 주므로 접두어 없이 써야 이벤트가 정상 발화한다.
 */
export function Sheet({ open, onClose, label, children }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  /** 드래그 오프셋을 지는 안쪽 래퍼 — 스냅백 도중의 실제 위치를 읽는 데 쓴다 */
  const panelRef = useRef<HTMLDivElement>(null);
  // 퇴장 동안 DOM에 남겨 두는 것은 전부 훅이 진다(폴백 타이머 포함).
  // ⚠ 300ms는 퇴장 애니메이션(0.14s)의 두 배다 — 아래 duration을 바꾸면 이 값도 함께 옮긴다.
  const exit = useExitTransition(open, 300);

  // 그래버 제스처(끌어 닫기·탭해서 닫기)는 전부 훅이 진다
  const { dragY, snapping, grabberProps } = useSheetDrag({
    active: open,
    sheetRef: ref,
    panelRef,
    onDismiss: onClose,
  });

  // 퇴장 중에는 active=false여야 포커스가 트리거로 돌아가고 Escape 리스너가 떨어진다
  useFocusTrap(ref, open, onClose);

  if (!exit.mounted) return null;

  const closing = exit.closing;

  return (
    <>
      {/*
        스크림 클릭 = 취소. 시각 요소일 뿐이라 키보드 경로는 Escape가 담당한다.
        ⚠ 퇴장 중에는 **포인터를 놓는다.** 한때 삼키게 두었더니(아직 불투명한 시트 위 탭이 아래로
          새는 것을 막으려고) dim을 누른 직후 다른 곳을 눌러도 무반응이라 **닫기가 느리게 느껴졌다.**
          퇴장이 140ms로 짧아져 그 위험 창 자체가 좁아졌으므로 반응성을 택한다.
          대가 둘 — 시트 영역 탭이 그 아래로 샐 수 있고, 퇴장 중 트리거를 다시 눌러 재오픈하면
          `translateY(100%)`부터 재시작해 한 프레임 튄다. 140ms 창이라 수용한다.
      */}
      <div
        className={cn(
          "absolute inset-0 z-80 bg-ink/50",
          closing
            ? "pointer-events-none animate-[cm-fade-out_0.14s_cubic-bezier(0.4,0,1,1)_both]"
            : "animate-[cm-fade_0.2s_cubic-bezier(0.2,0,0,1)_both]",
        )}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        // 퇴장 140ms 동안은 포커스가 이미 트리거로 돌아갔는데 aria-modal 노드는 남아 있다.
        // 그대로 두면 보조기술이 모달을 둘로 보고(삭제하기 → Dialog 전환이 실제로 그렇다)
        // 페이지 나머지가 가려진 것으로 취급한다. inert가 포커스·접근성 트리·포인터를 함께 끊는다.
        inert={closing || undefined}
        onAnimationEnd={exit.onAnimationEnd}
        className={cn(
          "absolute inset-x-0 bottom-0 z-[81] flex max-h-[85%] flex-col outline-none",
          // ⚠ 퇴장은 **accelerate**(0.4,0,1,1)다 — 진입용 ease-otb는 감속 커브라 마지막 10%에
          //   전체 시간의 절반을 써서, 다 닫힌 것처럼 보이는 잔상이 100ms 가까이 남았다(styling.md).
          closing
            ? "pointer-events-none animate-[cm-sheet-out_0.14s_cubic-bezier(0.4,0,1,1)_both]"
            : "animate-[cm-sheet-in_0.28s_cubic-bezier(0.2,0,0,1)_both]",
        )}
      >
        <div
          ref={panelRef}
          // 드래그 오프셋은 런타임에 정해지는 값이라 style prop이 허용되는 자리다(styling.md)
          style={{ transform: `translateY(${dragY}px)` }}
          className={cn(
            "flex min-h-0 flex-col overflow-hidden rounded-t-[20px] bg-canvas",
            // 아래는 화면 밖이라 그림자를 위로 던진다
            "shadow-[0_-8px_32px_rgba(0,0,0,0.12)]",
            "pb-[max(8px,env(safe-area-inset-bottom))]",
            snapping && "transition-transform duration-200 ease-otb",
          )}
        >
          {/*
            그래버 밴드 — 드래그 핸들이자 **닫기 버튼**이다.
            ⚠ `div`로 두면 안 된다. 이 시트의 닫기 수단(스크림 탭·Escape·스와이프)은 셋 다
              포인터이거나 물리 키보드라, 스크린리더 사용자에게 닿는 것이 하나도 없다
              (스크림·그래버는 aria-hidden이고 aria-modal이 바깥을 가린다). 실제로 오버플로
              메뉴는 남의 글이면 항목 3개가 전부 disabled여서 **시트 안에 활성 컨트롤이 0개**가 되고,
              포커스가 outline-none인 컨테이너에 놓여 Tab도 죽는다. 이 버튼이 그 탈출구다.
            ⚠ touch-action은 여기에만 건다(시트 전체에 걸면 목록 스크롤이 죽는다).
            높이 44px(py-5 + 바 4px) — 짚어야 끌 수 있는 띠라 히트 영역 기준을 지킨다.
          */}
          <button
            type="button"
            aria-label="닫기"
            {...grabberProps}
            // ⚠ select-none — touch-none은 터치 스크롤만 막는다. 마우스로 끌면 시트 안 텍스트가 선택된다
            className="flex w-full shrink-0 cursor-grab touch-none select-none justify-center py-5 active:cursor-grabbing"
          >
            <span aria-hidden className="h-1 w-9 rounded-full bg-hairline-strong" />
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">{children}</div>
        </div>
      </div>
    </>
  );
}

interface SheetItemProps {
  icon?: LucideIcon;
  /** 파괴적 액션 — crimson */
  danger?: boolean;
  /** 아직 구현하지 않은 항목(알림 끄기·차단·신고) — 자리는 두되 누를 수 없다 */
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

/**
 * 시트 항목 — 구분선 없이 여백으로 나눈다(edge-to-edge 시트에서 헤어라인은 화면을 가로지른다).
 *
 * ⚠ 비활성은 `aria-disabled`가 아니라 **HTML `disabled`** 다.
 *   `aria-disabled` + `pointer-events-none`은 **키보드 포커스를 막지 못해**
 *   "포커스는 가는데 Enter를 눌러도 무반응"인 요소가 된다. 게다가 useFocusTrap의
 *   FOCUSABLE 셀렉터가 `button:not([disabled])`라 aria-disabled는 걸러지지 않아,
 *   **시트를 열면 초기 포커스가 비활성 항목에 놓였다**(실측). disabled면 둘 다 해소된다.
 *
 * ⚠ 대신 항목이 전부 `disabled`면 시트에 포커스 가능한 것이 하나도 남지 않는다.
 *   그 상태를 떠받치는 것이 그래버 닫기 버튼이다 — 없애면 초기 포커스가 갈 곳을 잃고
 *   Tab이 죽는다(오버플로 메뉴의 "남의 글" 분기가 실제로 그 경우다).
 */
export function SheetItem({ icon, danger, disabled, onClick, children }: SheetItemProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-13 w-full items-center gap-3 px-5 py-3.5 text-left",
        "text-[15px] font-medium",
        "transition-colors duration-150 ease-otb active:bg-canvas-soft",
        danger ? "text-crimson" : "text-ink",
        "disabled:opacity-40",
      )}
    >
      {icon && <Icon as={icon} size={20} />}
      {children}
    </button>
  );
}
