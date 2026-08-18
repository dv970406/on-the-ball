"use client";

import { useState } from "react";
import {
  POLL_OPTION_MAX,
  POLL_OPTION_MIN,
  type PollFieldErrors,
  type PollInput,
  validatePoll,
} from "./poll-schema";

/** 투표를 붙이면 이만큼의 빈 칸으로 시작한다(최소 개수) */
const INITIAL_OPTIONS = Array.from({ length: POLL_OPTION_MIN }, () => "");

/**
 * 글쓰기 화면의 투표 초안.
 *
 * ⚠ **`usePostDraft`에 합치지 않는다.** 그쪽은 이미 네 묶음을 반환해 "여섯 개" 한계에
 *   가깝고, 무엇보다 `PostInput`(= post 컬럼)의 단일 소스인데 투표는 **작성 전용**이라
 *   함께 바뀌지 않는다. 두 초안이 한 값을 두고 다투지도 않으므로 쪼개는 것이 맞다.
 */
export function usePollDraft() {
  const [enabled, setEnabled] = useState(false);
  const [draft, setDraft] = useState({ question: "", options: INITIAL_OPTIONS });
  const [errors, setErrors] = useState<PollFieldErrors>({});

  const changeQuestion = (question: string) => {
    setDraft((prev) => ({ ...prev, question }));
    setErrors((prev) => ({ ...prev, question: undefined }));
  };

  const changeOption = (index: number, value: string) => {
    setDraft((prev) => ({
      ...prev,
      options: prev.options.map((o, i) => (i === index ? value : o)),
    }));
    // 그 칸의 문구만 지운다 — 다른 칸의 안내까지 사라지면 무엇이 남았는지 알 수 없다
    setErrors((prev) => ({
      ...prev,
      options: prev.options?.map((e, i) => (i === index ? undefined : e)),
      form: undefined,
    }));
  };

  const addOption = () => {
    setDraft((prev) =>
      prev.options.length >= POLL_OPTION_MAX
        ? prev
        : { ...prev, options: [...prev.options, ""] },
    );
    setErrors((prev) => ({ ...prev, form: undefined }));
  };

  const removeOption = (index: number) => {
    // ⚠ 가드를 **업데이터 밖**에 둔다. 두 state의 조건이 갈리면(draft는 그대로인데 errors만
    //   한 칸 줄면) 그 뒤로 문구가 엉뚱한 칸에 붙고, 업데이터 안에서 다른 setState를 부르면
    //   StrictMode의 이중 호출에 필터가 두 번 먹는다.
    if (draft.options.length <= POLL_OPTION_MIN) return;
    setDraft((prev) => ({ ...prev, options: prev.options.filter((_, i) => i !== index) }));
    setErrors((prev) => ({
      ...prev,
      options: prev.options?.filter((_, i) => i !== index),
      form: undefined,
    }));
  };

  /** 붙이기/떼기. 뗄 때 입력을 비워 둔다 — 다시 붙였는데 옛 질문이 남아 있으면 오인된다 */
  const toggle = () => {
    setEnabled((prev) => !prev);
    setDraft({ question: "", options: INITIAL_OPTIONS });
    setErrors({});
  };

  /**
   * 제출 시점 검증.
   * ⚠ 투표를 붙이지 않았으면 `null`이 **정상값**이다 — 실패(`undefined`)와 구분해야
   *   호출부가 "투표 없는 글"과 "검증 실패"를 가를 수 있다.
   */
  const validate = (): PollInput | null | undefined => {
    if (!enabled) return null;
    const result = validatePoll(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return undefined;
    }
    setErrors({});
    return result.value;
  };

  return { enabled, draft, errors, validate, toggle, change: { changeQuestion, changeOption, addOption, removeOption } };
}
