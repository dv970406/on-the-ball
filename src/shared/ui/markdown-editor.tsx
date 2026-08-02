"use client";

import { useId, useState } from "react";
import { cn } from "@/shared/lib";
import { Markdown } from "./markdown";

interface MarkdownEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
  maxLength?: number;
}

type Tab = "write" | "preview";

const TAB_LABEL: Record<Tab, string> = { write: "작성", preview: "미리보기" };

/** 토글 하나의 클래스 — 값이 유한한 열거형이라 style이 아니라 클래스 분기로 처리한다 */
function tabClassName(active: boolean) {
  return cn(
    "rounded-xs px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ease-otb",
    active ? "bg-canvas text-ink" : "text-ink-mute-2",
  );
}

/**
 * 마크다운 입력기 — 평범한 textarea + 미리보기 탭.
 * WYSIWYG를 만들지 않는다. 원문을 그대로 저장하므로 입력도 원문으로 받는 게 정직하다.
 */
export function MarkdownEditor({
  label,
  value,
  onChange,
  placeholder,
  error,
  required,
  maxLength,
}: MarkdownEditorProps) {
  const id = useId();
  const [tab, setTab] = useState<Tab>("write");

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[13px] font-medium text-ink-mute">
          {label}
        </label>
        {/*
          role="tablist"를 쓰지 않는다. tab 롤을 선언하면 스크린리더가 대응하는 tabpanel과
          화살표키 이동을 기대하는데, 실체는 그냥 "작성/미리보기" 토글 두 개다.
          반쪽짜리 tablist(aria-controls·tabpanel 없음)보다 aria-pressed 토글이 정직하다.
        */}
        <div className="flex gap-0.5 rounded-sm bg-canvas-soft p-0.5">
          {(Object.keys(TAB_LABEL) as Tab[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
              className={tabClassName(tab === key)}
            >
              {TAB_LABEL[key]}
            </button>
          ))}
        </div>
      </div>

      {tab === "write" ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          className={cn(
            "min-h-[280px] w-full resize-y rounded-sm border bg-canvas px-3 py-3 font-mono text-[14px] leading-[1.7] text-ink transition-colors duration-150 ease-otb",
            "placeholder:text-ink-faint focus:outline-none",
            error ? "border-crimson" : "border-hairline-strong focus:border-ink",
          )}
        />
      ) : (
        <div className="min-h-[280px] rounded-sm border border-hairline-strong bg-canvas px-3 py-1">
          {value.trim() ? (
            <Markdown>{value}</Markdown>
          ) : (
            <p className="py-6 text-center text-[13px] text-ink-faint">
              작성 탭에서 내용을 입력하면 여기에 미리보기가 나와요.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-[12px] leading-[1.5] text-crimson" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
