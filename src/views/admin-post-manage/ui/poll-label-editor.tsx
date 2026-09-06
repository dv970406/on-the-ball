"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { lengthOverflow, normalizeNickname } from "@/shared/lib";
import { Button, TextField } from "@/shared/ui";
import { POLL_OPTION_LIMIT, POLL_QUESTION_LIMIT, type Poll } from "@/entities/poll";

/**
 * 딸린 투표의 **문구만** 고친다.
 *
 * ⚠ 선택지를 더하거나 뺄 수 없다 — 이미 던져진 표가 선택지 id에 붙어 있어 개수를 바꾸면
 *   집계가 어긋난다. RPC도 id 집합이 정확히 일치하는지 확인해 거부한다.
 * ⚠ 라벨을 **정규형으로 접어** 비교한다 — 접지 않으면 DB의 unique(post_id, label)이
 *   제로폭 문자로 우회되어 똑같이 생긴 선택지가 여럿 남는다.
 * ⚠ **길이도 두 단위로 겹쳐 건다.** 어드민 화면이라고 예외가 아니다 — 안 걸면 DB CHECK가
 *   23514를 내고 `toDbErrorMessage`가 "입력값이 허용 범위를 벗어났어요."로 접어 **어느 칸이
 *   문제인지 알 수 없다.** 한도는 `entities/poll`이 소유한다(글쓰기와 같은 값이어야 한다).
 */
export function PollLabelEditor({
  poll,
  isPending,
  onSubmit,
}: {
  poll: Poll;
  isPending: boolean;
  onSubmit: (question: string, options: { id: number; label: string }[]) => void;
}) {
  const [question, setQuestion] = useState(poll.question);
  const [labels, setLabels] = useState<Record<number, string>>(() =>
    Object.fromEntries(poll.options.map((option) => [option.id, option.label])),
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const options = poll.options.map((option) => ({
      id: option.id,
      label: normalizeNickname(labels[option.id] ?? ""),
    }));

    if (normalizeNickname(question) === "") {
      setError("투표 질문을 입력해 주세요.");
      return;
    }
    const questionOver = lengthOverflow(question, POLL_QUESTION_LIMIT);
    if (questionOver !== null) {
      setError(
        questionOver === "grapheme"
          ? `질문은 ${POLL_QUESTION_LIMIT.grapheme}자까지 쓸 수 있어요.`
          : "질문이 너무 길어요.",
      );
      return;
    }
    if (options.some((option) => option.label === "")) {
      setError("선택지를 입력해 주세요.");
      return;
    }
    const optionOver = options
      .map((option) => lengthOverflow(option.label, POLL_OPTION_LIMIT))
      .find((over) => over !== null);
    if (optionOver !== undefined && optionOver !== null) {
      setError(
        optionOver === "grapheme"
          ? `선택지는 ${POLL_OPTION_LIMIT.grapheme}자까지 쓸 수 있어요.`
          : "선택지가 너무 길어요.",
      );
      return;
    }
    if (new Set(options.map((option) => option.label)).size !== options.length) {
      setError("같은 선택지를 두 번 쓸 수 없어요.");
      return;
    }
    setError(null);
    onSubmit(question, options);
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby="poll-edit-heading"
      className="flex flex-col gap-3 border-b border-hairline-cool px-5 py-4"
    >
      <h3 id="poll-edit-heading" className="text-[13px] font-medium text-ink">
        투표 문구 (개수는 못 바꿔요)
      </h3>
      <TextField label="질문" value={question} onChange={(e) => setQuestion(e.target.value)} />
      {poll.options.map((option, index) => (
        <TextField
          key={option.id}
          label={`선택지 ${index + 1}`}
          value={labels[option.id] ?? ""}
          onChange={(e) => setLabels((prev) => ({ ...prev, [option.id]: e.target.value }))}
        />
      ))}
      {error && <p className="text-[12px] text-crimson">{error}</p>}
      <Button type="submit" variant="secondary" block disabled={isPending}>
        {isPending ? "저장 중…" : "투표 문구 저장"}
      </Button>
    </form>
  );
}
