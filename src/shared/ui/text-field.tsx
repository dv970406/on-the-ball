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
          // 에메랄드는 뷰포트당 1개 규칙에 걸리므로 포커스는 잉크 래더로 표현한다.
          // ⚠ 에러 상태에도 반드시 포커스 표시를 남긴다 — outline을 지워 놓고 error 분기에
          //   focus 규칙이 없으면 **검증 실패 직후 키보드 사용자가 착지하는 바로 그 필드에서**
          //   포커스가 보이지 않는다(WCAG 2.4.7). 테두리 색은 에러(crimson)를 유지해야
          //   상태가 사라지지 않으므로, 링을 따로 얹어 포커스를 표현한다.
          error
            ? "border-crimson focus:ring-2 focus:ring-crimson/[0.35]"
            : "border-hairline-strong focus:border-ink",
          "disabled:opacity-40",
          className,
        )}
        {...inputProps}
      />
      {(error || hint) && (
        <p
          id={describedById}
          // 제출 후 동적으로 뜨는 에러는 role="alert"가 없으면 스크린리더가 침묵한다
          // (aria-describedby만으로는 포커스가 이미 그 필드에 있을 때만 읽힌다).
          // 앱의 다른 모든 에러 표시가 role="alert"라 형태도 여기서 맞춘다.
          role={error ? "alert" : undefined}
          className={cn("text-[12px] leading-[1.5]", error ? "text-crimson" : "text-ink-mute-2")}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
