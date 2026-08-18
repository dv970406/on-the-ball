"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { cn, useFocusTrap } from "@/shared/lib";
import { TextField } from "@/shared/ui";
import { parseExternalUrl } from "../lib/external-url";

interface LinkInsertDialogProps {
  /** 에디터에서 선택 중이던 텍스트 — 표시 텍스트의 초깃값 */
  initialLabel: string;
  onCancel: () => void;
  onConfirm: (label: string, href: string) => void;
}

/**
 * 링크 삽입 입력 오버레이.
 *
 * ⚠ **`Dialog`도 `Sheet`도 쓰지 않는다.**
 *   - `Dialog`는 `role="alertdialog"` + `description: string` 계약이 의도적으로 좁다.
 *     응답을 기다리는 **확인 대화상자**이지 폼이 아니라, children 슬롯을 뚫으면 그 성격이 흐려진다.
 *   - `Sheet`는 화면 하단에 붙어 있어 **소프트 키보드가 올라오면 입력칸이 가려진다.** 게다가
 *     `useFocusTrap`의 초기 포커스가 그래버(닫기 버튼)로 가는데, 폼에서는 최악의 첫 포커스다.
 *
 * ⚠ 그래서 위치를 **`top-20`으로 고정**한다(센터링하지 않는다). 키보드가 올라와도 남는 자리다.
 * ⚠ 필드 순서가 곧 포커스 순서다 — `TextField`가 ref를 밖으로 내주지 않아 프로그램적으로
 *   포커스를 줄 수 없다. 주소 칸을 **먼저** 두어 포커스 트랩이 그것을 잡게 한다.
 *
 * ⚠ `Dialog`와 달리 `open` prop을 받지 않는다. **호출부가 열릴 때만 마운트한다.**
 *   입력값을 갖는 오버레이라 닫힐 때 초기화가 필요한데, 그걸 effect로 하면
 *   `react-hooks/set-state-in-effect`에 걸린다 — 언마운트가 곧 초기화다.
 */
export function LinkInsertDialog({ initialLabel, onCancel, onConfirm }: LinkInsertDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [href, setHref] = useState("");
  const [label, setLabel] = useState(initialLabel);
  const [error, setError] = useState<string | undefined>();
  useFocusTrap(ref, true, onCancel);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = parseExternalUrl(href);
    // 실패하면 닫지 않는다 — 닫아 버리면 사용자가 왜 안 들어갔는지 알 수 없다
    if (!result.ok) return setError(result.message);
    onConfirm(label, result.href);
  };

  return (
    <>
      <div
        className="absolute inset-0 z-80 bg-ink/50 motion-safe:animate-[cm-fade_0.2s_cubic-bezier(0.2,0,0,1)_both]"
        onClick={onCancel}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "absolute inset-x-6 top-20 z-[82] rounded-xl bg-canvas outline-none",
          "px-[22px] pb-4 pt-6 shadow-[0_16px_48px_rgba(0,0,0,0.12)]",
          "motion-safe:animate-[cm-fade_0.2s_cubic-bezier(0.2,0,0,1)_both]",
        )}
      >
        <h2 id={titleId} className="text-[17px] font-semibold tracking-[-0.4px] text-ink">
          링크 넣기
        </h2>
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3.5">
          <TextField
            label="링크 주소"
            // ⚠ type="url"을 쓰지 않는다. 브라우저 기본 검증이 스킴 없는 입력(example.com)에서
            //   제출을 통째로 막아, "https를 붙여 다시 해석한다"는 편의가 죽고 우리 안내 문구가
            //   실행될 기회조차 없었다(실측). 판정은 parseExternalUrl이 단독으로 갖는다.
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="example.com"
            value={href}
            error={error}
            onChange={(e) => {
              setHref(e.target.value);
              setError(undefined);
            }}
          />
          <TextField
            label="표시할 텍스트 (선택)"
            placeholder="비워 두면 주소가 그대로 보여요"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-11 flex-1 rounded-sm border border-hairline-strong bg-canvas text-[15px] font-medium text-ink transition-colors duration-150 ease-otb active:border-ink"
            >
              취소
            </button>
            <button
              type="submit"
              className="h-11 flex-1 rounded-sm border border-ink bg-ink text-[15px] font-medium text-white transition-colors duration-150 ease-otb"
            >
              넣기
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
