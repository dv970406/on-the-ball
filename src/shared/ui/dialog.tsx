"use client";

import { useId, useRef } from "react";
import { cn } from "@/shared/lib";
import { useFocusTrap } from "@/shared/lib/use-focus-trap";

interface DialogProps {
  open: boolean;
  /** 취소 — 스크림 클릭·Escape가 모두 이걸 부른다 */
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  /** 확인이 파괴적 액션이면 crimson, 아니면 잉크 블랙 */
  destructive?: boolean;
}

/**
 * 확인 다이얼로그 (프로토타입 `.cm-dialog`) — 글 삭제·작성 이탈에 쓴다.
 *
 * ⚠ role="alertdialog": 사용자의 응답을 기다리는 중단성 대화다.
 * ⚠ 스크림 클릭·Escape는 **취소**로 처리한다 — 파괴적 액션이 기본값이 되면 안 된다.
 */
export function Dialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  cancelLabel,
  confirmLabel,
  destructive,
}: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useFocusTrap(ref, open, onCancel);

  if (!open) return null;

  return (
    <>
      <div
        className="absolute inset-0 z-80 bg-ink/50 motion-safe:animate-[cm-fade_0.2s_cubic-bezier(0.2,0,0,1)_both]"
        onClick={onCancel}
        aria-hidden
      />
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className={cn(
          "absolute inset-x-6 top-1/2 z-[82] -translate-y-1/2 rounded-xl bg-canvas outline-none",
          "px-[22px] pb-4 pt-6 shadow-[0_16px_48px_rgba(0,0,0,0.12)]",
          "motion-safe:animate-[cm-fade_0.2s_cubic-bezier(0.2,0,0,1)_both]",
        )}
      >
        <h2 id={titleId} className="text-[17px] font-semibold tracking-[-0.4px] text-ink">
          {title}
        </h2>
        <p id={descId} className="mb-5 mt-2 text-[13px] leading-[1.6] text-ink-mute">
          {description}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 flex-1 rounded-sm border border-hairline-strong bg-canvas text-[15px] font-medium text-ink transition-colors duration-150 ease-otb active:border-ink"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "h-11 flex-1 rounded-sm border text-[15px] font-medium text-white",
              "transition-colors duration-150 ease-otb",
              destructive ? "border-crimson bg-crimson" : "border-ink bg-ink",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
