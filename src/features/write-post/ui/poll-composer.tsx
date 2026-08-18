"use client";

import { useId, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { Icon, TextField } from "@/shared/ui";
import { POLL_OPTION_MAX, POLL_OPTION_MIN, type PollFieldErrors } from "../model/poll-schema";

interface PollComposerProps {
  draft: { question: string; options: string[] };
  errors: PollFieldErrors;
  onChangeQuestion: (value: string) => void;
  onChangeOption: (index: number, value: string) => void;
  onAddOption: () => void;
  onRemoveOption: (index: number) => void;
  onRemove: () => void;
}

/**
 * ⚠ 폼 안의 단일행 input은 Enter로 **글 전체를 제출**한다. 선택지를 채우다 줄바꿈하듯
 *   Enter를 누른 사람에게는 글이 등록돼 버리는 셈이라 막는다.
 *
 * ⚠ **IME 조합 중의 Enter는 건드리지 않는다.** 한글·일본어 입력기는 조합을 확정할 때도
 *   Enter를 보내는데(`isComposing: true`), 그것까지 삼키면 이 핸들러에 나중에 동작이
 *   붙는 순간 한글 사용자만 조합 확정마다 그 동작이 실행된다. 지금은 `preventDefault`뿐이라
 *   무해하지만, 가드가 없으면 그 함정이 다음 사람에게 그대로 넘어간다.
 */
function preventEnterSubmit(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter" && !e.nativeEvent.isComposing) e.preventDefault();
}

/**
 * 글쓰기 화면의 투표 입력. 상세에서 보이는 모양(`entities/poll`의 `PollBlock`)과 같은
 * 카드 껍데기를 써서, 붙이는 순간 결과물이 짐작되게 한다.
 *
 * ⚠ 상태는 전부 `usePollDraft`가 갖는다 — 이 컴포넌트는 그리기만 한다.
 */
export function PollComposer({
  draft,
  errors,
  onChangeQuestion,
  onChangeOption,
  onAddOption,
  onRemoveOption,
  onRemove,
}: PollComposerProps) {
  const titleId = useId();

  return (
    // ⚠ `aria-label`이 아니라 **보이는 제목을 가리킨다.** 라벨을 따로 쓰면 접근성 이름이
    //   화면의 글자와 달라져, 음성 제어로 "투표"라고 불러도 이 영역이 잡히지 않는다.
    <section
      aria-labelledby={titleId}
      className="mt-6 rounded-[14px] border border-hairline-cool bg-canvas-soft px-4 py-4"
    >
      <div className="mb-3.5 flex items-center">
        <h2 id={titleId} className="text-[13px] font-semibold text-ink">
          투표
        </h2>
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto text-[12px] font-medium text-ink-mute underline underline-offset-2"
        >
          투표 빼기
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <TextField
          label="질문"
          placeholder="무엇을 물어볼까요?"
          value={draft.question}
          error={errors.question}
          onChange={(e) => onChangeQuestion(e.target.value)}
          onKeyDown={preventEnterSubmit}
        />

        {draft.options.map((option, index) => (
          // ⚠ key를 index로 둔다. 선택지는 내용이 곧 값이라 안정적인 id가 없고,
          //   내용으로 키를 잡으면 타이핑 중 매 글자마다 입력이 새로 마운트되어 포커스가 날아간다.
          <div key={index} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <TextField
                label={`선택지 ${index + 1}`}
                placeholder={index === 0 ? "예: 수비형 미드필더" : ""}
                value={option}
                error={errors.options?.[index]}
                onChange={(e) => onChangeOption(index, e.target.value)}
                onKeyDown={preventEnterSubmit}
              />
            </div>
            {/* 최소 개수에서는 지울 수 없다 — 버튼을 감추면 자리가 흔들려 disabled로 둔다 */}
            <button
              type="button"
              aria-label={`선택지 ${index + 1} 지우기`}
              disabled={draft.options.length <= POLL_OPTION_MIN}
              onClick={() => onRemoveOption(index)}
              className="mt-[26px] flex size-11 shrink-0 items-center justify-center rounded-sm text-ink-mute disabled:opacity-30"
            >
              <Icon as={X} size={16} />
            </button>
          </div>
        ))}
      </div>

      {draft.options.length < POLL_OPTION_MAX && (
        <button
          type="button"
          onClick={onAddOption}
          className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-hairline-strong text-[13px] font-medium text-ink-mute"
        >
          <Icon as={Plus} size={15} />
          선택지 추가
        </button>
      )}

      {errors.form && <p className="mt-2.5 text-[12px] text-crimson">{errors.form}</p>}

      <p className="mt-3 text-[11px] leading-[1.5] text-ink-mute-2">
        투표는 글을 올릴 때 함께 만들어지고, 이후에는 고칠 수 없어요.
      </p>
    </section>
  );
}
