"use client";

import { useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn, useFocusTrap } from "@/shared/lib";
import { Icon } from "./icon";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** 스크린리더가 읽을 시트의 이름 — 시각적으로는 감춘다 */
  label: string;
  children: ReactNode;
}

/**
 * 하단 바텀시트 (프로토타입 `.cm-sheet`). 오버플로 메뉴(···)에 쓴다.
 *
 * 루트 layout의 430px 프레임이 `relative`라 absolute가 프레임 안쪽에 얹힌다.
 * 스크림은 불투명 `ink/50` — 블러를 쓰지 않는다(blur는 하단 탭바에서만 허용).
 */
export function Sheet({ open, onClose, label, children }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open, onClose);

  if (!open) return null;

  return (
    <>
      {/* 스크림 클릭 = 취소. 시각 요소일 뿐이라 키보드 경로는 Escape가 담당한다 */}
      <div
        className="absolute inset-0 z-80 bg-ink/50 motion-safe:animate-[cm-fade_0.2s_cubic-bezier(0.2,0,0,1)_both]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "absolute inset-x-2 bottom-2 z-[81] overflow-hidden rounded-xl bg-canvas outline-none",
          "shadow-[0_16px_48px_rgba(0,0,0,0.12)]",
          "motion-safe:animate-[cm-up_0.25s_cubic-bezier(0.2,0,0,1)_both]",
        )}
      >
        {children}
      </div>
    </>
  );
}

interface SheetItemProps {
  icon?: LucideIcon;
  /** 파괴적 액션 — crimson. HOT 배지와 함께 crimson이 허용되는 유일한 자리다 */
  danger?: boolean;
  /** 아직 구현하지 않은 항목(알림 끄기·차단·신고) — 자리는 두되 누를 수 없다 */
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

/**
 * 시트 항목 — 마지막 항목의 하단 헤어라인은 CSS가 지운다(last:border-b-0)
 *
 * ⚠ 비활성은 `aria-disabled`가 아니라 **HTML `disabled`** 다.
 *   `aria-disabled` + `pointer-events-none`은 **키보드 포커스를 막지 못해**
 *   "포커스는 가는데 Enter를 눌러도 무반응"인 요소가 된다. 게다가 useFocusTrap의
 *   FOCUSABLE 셀렉터가 `button:not([disabled])`라 aria-disabled는 걸러지지 않아,
 *   **시트를 열면 초기 포커스가 비활성 항목에 놓였다**(실측). disabled면 둘 다 해소된다.
 */
export function SheetItem({ icon, danger, disabled, onClick, children }: SheetItemProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 border-b border-hairline-cool px-[18px] py-4 text-left",
        "text-[15px] font-medium last:border-b-0",
        "transition-colors duration-150 ease-otb active:bg-canvas-soft",
        danger ? "text-crimson" : "text-ink",
        "disabled:opacity-40",
      )}
    >
      {icon && <Icon as={icon} size={17} />}
      {children}
    </button>
  );
}

/** 시트 맨 아래의 "닫기" — 아이콘 없이 가운데 정렬, 뉴트럴 톤 */
export function SheetCloseItem({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center px-[18px] py-4 text-[15px] font-medium text-ink-mute transition-colors duration-150 ease-otb active:bg-canvas-soft"
    >
      닫기
    </button>
  );
}
