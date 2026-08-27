"use client";

import { useId, useRef } from "react";
import { cn, useFocusTrap } from "@/shared/lib";

/**
 * 확인 버튼의 성격.
 *
 * ⚠ **에메랄드 위 글자는 `text-on-primary`다 — 흰색 금지**(`styling.md`).
 * ⚠ boolean 두 개(`destructive`·`primary`)로 두지 않는다 — 배타적인 값을 boolean으로
 *   나누면 둘 다 켠 상태가 타입으로 표현되고, 그때 무엇이 이기는지가 구현 순서에 걸린다
 *   (`code-quality.md`: 동작은 의미 기반 prop으로).
 */
const CONFIRM_TONE = {
  /** 기본 — 되돌릴 수 있는 확인(작성 이탈 등) */
  ink: "border-ink bg-ink text-white",
  /** 사용자가 원해서 누르는 진행 — 이 다이얼로그의 컬러 이벤트다 */
  primary: "border-primary bg-primary text-on-primary",
  /** 파괴적 — 삭제·차단 */
  danger: "border-crimson bg-crimson text-white",
} as const satisfies Record<string, string>;

type ConfirmTone = keyof typeof CONFIRM_TONE;

interface DialogProps {
  open: boolean;
  /** 취소 — 스크림 클릭·Escape가 모두 이걸 부른다 */
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  /** 확인 버튼의 성격. 기본은 잉크 블랙 */
  confirmTone?: ConfirmTone;
  /**
   * 기본은 `alertdialog` — 되돌릴 수 없는 확인(삭제·차단·작성 이탈)이 이 컴포넌트의 원래 자리다.
   *
   * ⚠ **`alertdialog`는 `alert` 시맨틱을 물려받아 내용을 assertive하게 끼어들어 읽는다.**
   *   ARIA 1.2가 이 롤에 두는 조건은 "긴급하거나 데이터를 잃는" 알림인데, 사용자가 방금 스스로
   *   누른 로그인 안내는 둘 다 아니다 → `SignInDialog`는 `role="dialog"`를 넘긴다.
   */
  role?: "dialog" | "alertdialog";
}

/**
 * 확인 다이얼로그 (프로토타입 `.cm-dialog`) — 되돌릴 수 없는 확인과 로그인 안내가 함께 쓴다.
 *
 * ⚠ 기본 role은 `alertdialog`(사용자의 응답을 기다리는 중단성 대화)이고,
 *   긴급하지도 파괴적이지도 않은 자리는 `role="dialog"`를 넘긴다 — 아래 prop 주석 참고.
 * ⚠ 스크림 클릭·Escape는 **취소**로 처리한다 — 파괴적 액션이 기본값이 되면 안 된다.
 * ⚠ **이 층은 컬러 이벤트를 스스로 하나 갖는다.** 스크림이 아래를 덮어 같은 뷰포트로
 *   세지 않기 때문이다 — 사유는 `styling.md`의 다이얼로그 항목.
 */
export function Dialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  cancelLabel,
  confirmLabel,
  confirmTone = "ink",
  role = "alertdialog",
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
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className={cn(
          "absolute inset-x-6 top-1/2 z-[82] rounded-xl bg-canvas outline-none",
          // ⚠ -translate-y-1/2 표준 유틸이 아니라 arbitrary property다 — 같은 요소에 animation이
          //   있으면 `translate` 개별 프로퍼티가 `transform`과 합성되어 조용히 어긋난다(styling.md).
          //   이 자리는 globals.css 주석이 이미 translateY 충돌을 경고한 곳이다.
          "[transform:translateY(-50%)]",
          "px-[22px] pb-4 pt-6 shadow-[0_16px_48px_rgba(0,0,0,0.12)]",
          "motion-safe:animate-[cm-fade_0.2s_cubic-bezier(0.2,0,0,1)_both]",
        )}
      >
        {/*
          ⚠ 가운데 정렬 + `text-balance`. 이 카드는 좌우 여백이 24px뿐이라 좌측 정렬이면
            마지막 줄이 짧게 남을 때마다 내용이 왼쪽으로 쏠려 보인다 — balance가 줄 길이를
            고르게 맞춘다(문구가 짧은 확인 대화라 성립한다).
          ⚠ **한국어는 `word-break: keep-all`이 필요하다.** 브라우저 기본값은 한글을 CJK로
            보아 음절 아무 데서나 끊어서 "먼저 로그인해 주세 / 요."가 된다.
            `break-words`는 그 상태로 두면 넘칠 때의 탈출구다 — 제목에 닉네임(최대 20자)이
            들어오는 자리가 있어 keep-all만으로는 카드 밖으로 삐져나간다.
          ⚠ 표준 유틸 `break-keep`을 쓰지 않고 arbitrary property인 이유는 twMerge가
            `break-keep`과 `break-words`를 **같은 그룹으로 보아 하나만 남기기** 때문이다
            (실측). 지금은 `cn()`을 거치지 않아 둘 다 살아 있지만, 나중에 누가 감싸면
            조용히 한쪽이 사라진다.
        */}
        <h2
          id={titleId}
          className="text-balance break-words text-center text-[17px] font-semibold tracking-[-0.4px] text-ink [word-break:keep-all]"
        >
          {title}
        </h2>
        <p
          id={descId}
          className="mb-5 mt-2 text-balance break-words text-center text-[13px] leading-[1.6] text-ink-mute [word-break:keep-all]"
        >
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
              "h-11 flex-1 rounded-sm border text-[15px] font-medium",
              "transition-colors duration-150 ease-otb",
              CONFIRM_TONE[confirmTone],
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
