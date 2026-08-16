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
  const describedById = `${id}-desc`;
  const [tab, setTab] = useState<Tab>("write");

  /**
   * 검증 에러가 떠 있는 동안에는 **작성 탭을 보여준다.**
   * ⚠ 미리보기 상태에서 제출하면 textarea가 언마운트된 채 에러만 떠서
   *   "내용을 입력해 주세요"가 가리키는 입력창이 화면에 없었다.
   *
   * state를 건드리지 않고 **파생**시킨다. 전에는 "에러가 새로 생겼을 때 setTab"으로 했는데,
   * 같은 메시지로 다시 제출하면 값이 같아 전이가 감지되지 않아 그 버그가 그대로 재현됐다
   * (빈 내용 제출 → 미리보기로 전환 → 다시 제출 → 탭이 안 돌아옴).
   * 파생이면 그런 구멍이 없다. 에러는 사용자가 내용을 고치는 순간 부모가 지운다.
   */
  const activeTab: Tab = error ? "write" : tab;

  // 미리보기에는 label이 가리킬 폼 컨트롤이 없다 —
  // htmlFor가 존재하지 않는 id를 가리키면 스크린리더에서 라벨 연결이 끊긴다.
  const LabelTag = activeTab === "write" ? "label" : "span";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <LabelTag
          htmlFor={activeTab === "write" ? id : undefined}
          className="text-[13px] font-medium text-ink-mute"
        >
          {label}
        </LabelTag>
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
              aria-pressed={activeTab === key}
              // 에러가 떠 있는 동안 미리보기는 잠근다 — 에러가 가리키는 입력창이 화면에서
              // 사라지면 안 된다. 첫 타이핑에 에러가 지워지므로 잠기는 구간은 아주 짧다.
              disabled={key === "preview" && Boolean(error)}
              onClick={() => setTab(key)}
              className={cn(tabClassName(activeTab === key), "disabled:opacity-40")}
            >
              {TAB_LABEL[key]}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "write" ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? describedById : undefined}
          className={cn(
            "min-h-[280px] w-full resize-y rounded-sm border bg-canvas px-3 py-3 font-mono text-[14px] leading-[1.7] text-ink transition-colors duration-150 ease-otb",
            "placeholder:text-ink-faint focus:outline-none",
            // TextField와 같은 이유로 에러 상태에도 포커스 표시를 남긴다
            error
              ? "border-crimson focus:ring-2 focus:ring-crimson/[0.35]"
              : "border-hairline-strong focus:border-ink",
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
        <p id={describedById} className="text-[12px] leading-[1.5] text-crimson">
          {error}
        </p>
      )}
    </div>
  );
}
