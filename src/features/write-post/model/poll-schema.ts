import { hasVisibleChar, lengthOverflow, normalizeNickname, type TextLimit } from "@/shared/lib";

/**
 * 투표 입력 검증 — **작성 전용**이다(투표는 생성 시 고정이라 수정 화면에 입력이 없다).
 *
 * 길이 규약은 제목·댓글과 같다: 화면은 그래핌, DB는 코드포인트 K=10배.
 * 짝이 되는 마이그레이션은 `20260817000003_poll.sql`이다.
 */

/** 질문 — 화면 100그래핌 / DB 1,000코드포인트(`poll.question` CHECK와 같은 값) */
export const POLL_QUESTION_LIMIT: TextLimit = { grapheme: 100, codePoint: 1000 };

/** 선택지 — 화면 40그래핌 / DB 400코드포인트(`post_poll_option.label` CHECK와 같은 값) */
export const POLL_OPTION_LIMIT: TextLimit = { grapheme: 40, codePoint: 400 };

/** DB의 `sort_order between 1 and 4`·`create_post_with_poll`의 P0001과 같은 값 */
export const POLL_OPTION_MIN = 2;
export const POLL_OPTION_MAX = 4;

/** 검증을 통과한 투표 입력 */
export interface PollInput {
  question: string;
  /** 화면 순서 그대로 — DB의 `sort_order`가 된다 */
  options: string[];
}

/** 폼이 들고 있는 **검증 전** 값 */
export interface PollDraft {
  question: string;
  options: string[];
}

export interface PollFieldErrors {
  question?: string;
  /** 선택지는 어느 칸이 문제인지 알려야 고칠 수 있다 — 인덱스별 문구 */
  options?: (string | undefined)[];
  /** 개수처럼 특정 칸에 못 붙이는 문제 */
  form?: string;
}

/**
 * ⚠ zod를 쓰지 않는다. 선택지가 **가변 길이 배열**이라 인덱스별 에러를 zod issue의
 *   `path`에서 되꺼내는 편이 직접 도는 것보다 길어지고, `validatePost`가 이미 하는
 *   "issue 배열 → 필드별 첫 메시지" 접기를 배열 차원까지 확장해야 한다.
 *   형태가 같지 않으므로 억지로 맞추지 않는다(`toAuthErrorMessage`↔`toDbErrorMessage`와 같은 판단).
 *
 * ⚠ 검사 순서가 규약이다 — **그래핌을 먼저** 봐야 일반 사용자에게 한도 숫자가 담긴 문구가 간다.
 *   코드포인트 초과 문구는 결합 문자를 쌓지 않는 한 도달할 수 없다.
 * ⚠ `graphemeLength(v) > MAX`를 직접 짜지 않는다 — 판정은 `lengthOverflow`가 소유한다.
 */
export function validatePoll(
  draft: PollDraft,
): { ok: true; value: PollInput } | { ok: false; errors: PollFieldErrors } {
  const errors: PollFieldErrors = {};

  const question = draft.question.trim();
  if (!hasVisibleChar(question)) {
    errors.question = "투표 질문을 입력해 주세요.";
  } else {
    const over = lengthOverflow(question, POLL_QUESTION_LIMIT);
    if (over) {
      errors.question =
        over === "grapheme"
          ? `질문은 ${POLL_QUESTION_LIMIT.grapheme}자까지 쓸 수 있어요.`
          : "질문이 너무 길어요.";
    }
  }

  /*
   * ⚠ **`.trim()`이 아니라 정규형으로 접는다.** 아래 중복 검사와 DB의 `unique (post_id, label)`이
   *   둘 다 이 값을 기준으로 삼는데, 다듬지 않으면 '찬성' · '찬성 ' · '찬'+제로폭공백+'성'이
   *   서로 다른 값이라 통과해 **똑같이 생긴 선택지가 여럿** 뜬다(표를 쪼개는 도구가 된다).
   * ⚠ 길이도 원본이 아니라 정규형으로 잰다 — DB가 저장하는 값이 이쪽이라, 원본으로 재면
   *   화면이 보여준 글자 수와 저장값이 갈린다(닉네임과 같은 이유).
   * ⚠ 이름이 `normalizeNickname`인 것은 첫 호출자를 기록할 뿐이고, 하는 일은
   *   "보이는 텍스트의 정규형"이다. DB의 `public.normalize_nickname`과 **한 쌍이라
   *   한쪽만 고치면 안 된다.**
   */
  const options = draft.options.map((o) => normalizeNickname(o));
  const optionErrors: (string | undefined)[] = options.map((option) => {
    if (!hasVisibleChar(option)) return "선택지를 입력해 주세요.";
    const over = lengthOverflow(option, POLL_OPTION_LIMIT);
    if (!over) return undefined;
    return over === "grapheme"
      ? `선택지는 ${POLL_OPTION_LIMIT.grapheme}자까지 쓸 수 있어요.`
      : "선택지가 너무 길어요.";
  });

  // 정규형이 같으면 결과를 읽을 수 없다 — 첫 중복 칸에만 문구를 붙인다
  const seen = new Set<string>();
  options.forEach((option, i) => {
    if (optionErrors[i]) return;
    if (seen.has(option)) optionErrors[i] = "같은 선택지를 두 번 쓸 수 없어요.";
    seen.add(option);
  });

  if (optionErrors.some(Boolean)) errors.options = optionErrors;

  if (options.length < POLL_OPTION_MIN || options.length > POLL_OPTION_MAX) {
    errors.form = `선택지는 ${POLL_OPTION_MIN}개에서 ${POLL_OPTION_MAX}개까지예요.`;
  }

  if (errors.question || errors.options || errors.form) return { ok: false, errors };
  return { ok: true, value: { question, options } };
}
