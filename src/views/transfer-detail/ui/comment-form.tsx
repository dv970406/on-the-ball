"use client";

import { useId } from "react";
import { cn } from "@/shared/lib";
import type { useCommentComposer } from "../model/use-comment-composer";

type ComposerField = ReturnType<typeof useCommentComposer>["field"];

interface CommentFormProps {
  field: ComposerField;
  placeholder: string;
  /** 스크린리더용 라벨 — placeholder는 라벨이 아니다(입력이 시작되면 사라진다) */
  label: string;
  /** 답글 칸에만 — `등록` 왼쪽의 `취소` */
  onCancel?: () => void;
  /** 세션 복원 중 — 자리는 그대로 두고 조작만 막는다(로그인 안내가 깜빡였다가 폼으로 바뀌지 않게) */
  disabled?: boolean;
  className?: string;
}

/** 입력칸 외곽 — 44px · 1px 선 · radius 8, 포커스 시 잉크 선. 비로그인 트리거와 공유한다 */
export const COMMENT_FIELD_BOX =
  "flex h-11 items-center gap-1.5 rounded-md border border-hairline-strong bg-canvas pl-3 pr-1 transition-colors duration-150 ease-otb";

/**
 * `등록` 버튼 — 34px · radius 6. ⚠ **잉크다(에메랄드가 아니다).** 이 화면의 CTA는 하단 관심 토글이라
 * 에메랄드를 하나 더 칠하지 않는다(styling.md "한 화면의 에메랄드는 하나"). 빈 값이면 꺼진다.
 * 히트 영역은 최소 폭 44 + 위아래로만 넓힌 투명 의사요소로 44px를 채운다(옆 `취소`를 덮지 않게).
 */
export const COMMENT_SUBMIT =
  "relative h-[34px] min-w-11 shrink-0 whitespace-nowrap rounded-sm bg-ink px-3 text-[13px] font-medium text-white transition-colors duration-150 ease-otb after:absolute after:inset-x-0 after:-inset-y-[5px] after:content-[''] disabled:bg-canvas-soft disabled:text-ink-faint";

/**
 * 댓글·답글 입력칸 — 조립(검증·가드·롤백)은 `useCommentComposer`가 하고 여기는 펼치기만 한다.
 *
 * ⚠ **`<input maxLength>`를 두지 않는다** — UTF-16 코드유닛을 세어 이모지가 한도의 절반에서
 *   조용히 잘린다. 길이는 제출 시점에 `validateComment`가 그래핌·코드포인트로 잰다.
 * ⚠ Enter 제출은 폼의 암묵적 제출이다 — 한글 조합 중의 Enter는 훅의 `onKeyDown`이 막는다.
 */
export function CommentForm({
  field,
  placeholder,
  label,
  onCancel,
  disabled,
  className,
}: CommentFormProps) {
  const inputId = useId();
  const { ref, ...inputProps } = field.inputProps;

  return (
    <form {...field.formProps} className={className}>
      <div className={cn(COMMENT_FIELD_BOX, "focus-within:border-ink")}>
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        <input
          id={inputId}
          ref={ref}
          {...inputProps}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="send"
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-mute-2 disabled:bg-transparent"
        />
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            // 폭 최소 44 + 위아래 히트 영역 확장 — 옆 `등록`의 히트 영역은 위아래로만 넓혀 서로 덮지 않는다
            className="relative h-[34px] min-w-11 shrink-0 whitespace-nowrap px-2 text-[13px] text-ink-mute after:absolute after:inset-x-0 after:-inset-y-[5px] after:content-['']"
          >
            취소
          </button>
        )}
        <button type="submit" disabled={disabled || !field.canSubmit} className={COMMENT_SUBMIT}>
          등록
        </button>
      </div>
      {field.message && (
        // id는 입력의 aria-describedby가 가리키는 곳이다 — 훅이 한 값으로 둘을 만든다
        <p id={field.message.id} className="mt-1.5 text-[12px] text-crimson">
          {field.message.text}
        </p>
      )}
    </form>
  );
}

/**
 * 비로그인의 입력칸 — **입력칸과 같은 모양의 버튼**이다. 누르면 로그인 안내가 뜬다.
 * ⚠ 컨트롤을 죽이고 옆에 "로그인하고 쓰기" 링크를 다는 형태로 바꾸지 않는다 — 사용자가 누르는 것은
 *   입력칸이라 **눌러도 반응이 없는 UI**가 된다(`reuse.md` `WatchToggle` 항목과 같은 판단).
 */
export function CommentSignInField({
  placeholder,
  onClick,
}: {
  placeholder: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={cn(COMMENT_FIELD_BOX, "w-full text-left")}>
      <span className="min-w-0 flex-1 truncate text-[14px] text-ink-mute-2">{placeholder}</span>
      <span className="sr-only">(로그인 필요)</span>
      <span aria-hidden className={cn(COMMENT_SUBMIT, "inline-flex items-center bg-canvas-soft text-ink-faint")}>
        등록
      </span>
    </button>
  );
}
