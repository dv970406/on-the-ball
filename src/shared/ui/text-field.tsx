"use client";

import { useId, type InputHTMLAttributes } from "react";
import { cn } from "@/shared/lib";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  /** 필드 단위 에러 문구 — 있으면 테두리를 crimson으로 바꾸고 아래에 노출한다 */
  error?: string;
  /** 에러가 아닌 보조 설명 (error가 있으면 가려진다) */
  hint?: string;
}

/**
 * 라벨 + 인풋 + 에러를 한 덩어리로 묶은 폼 필드.
 * 인증 화면 4개와 게시글 작성/수정에서 공유한다.
 */
export function TextField({ label, error, hint, className, ...inputProps }: TextFieldProps) {
  const id = useId();
  const describedById = `${id}-desc`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink-mute">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? describedById : undefined}
        className={cn(
          "w-full rounded-sm border bg-canvas px-3 py-3 text-[15px] text-ink transition-colors duration-150 ease-otb",
          "placeholder:text-ink-faint focus:outline-none",
          // 에메랄드는 뷰포트당 1개 규칙에 걸리므로 포커스는 잉크 래더로 표현한다
          error ? "border-crimson" : "border-hairline-strong focus:border-ink",
          "disabled:opacity-40",
          className,
        )}
        {...inputProps}
      />
      {(error || hint) && (
        <p
          id={describedById}
          className={cn("text-[12px] leading-[1.5]", error ? "text-crimson" : "text-ink-mute-2")}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
