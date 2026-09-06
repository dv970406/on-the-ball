import { hasVisibleChar, lengthOverflow, normalizeNickname, type TextLimit } from "@/shared/lib";

/**
 * 길이 한도 — **두 단위로 겹쳐 건다**(화면=그래핌, DB=코드포인트 K=10배).
 *
 * ⚠ 입축구는 그동안 클라이언트 쓰기 경로가 없어 `api-and-db.md`의 한도 표에서 빠져 있었다.
 *   어드민 화면이 생기는 순간 **그 표의 대상이 된다** — 그 문서에 세 줄을 함께 추가한다.
 * ⚠ `graphemeLength(v) > MAX`를 직접 짜지 않는다. 1그래핌의 코드포인트 수에 상한이 없어
 *   그래핌 한도가 DB 한도를 함의하지 못하고, 빠뜨려도 어떤 검사도 잡지 못한다 →
 *   판정은 `lengthOverflow`가 단독으로 소유한다.
 */
export const SURVEY_TITLE_LIMIT: TextLimit = { grapheme: 100, codePoint: 1000 };
export const SURVEY_LABEL_LIMIT: TextLimit = { grapheme: 40, codePoint: 400 };
export const SURVEY_SUBTITLE_LIMIT: TextLimit = { grapheme: 40, codePoint: 400 };

export const SURVEY_OPTION_MIN = 2;
export const SURVEY_OPTION_MAX = 4;

/**
 * `#rrggbb` — DB CHECK와 **같은 형태**를 본다.
 * ⚠ 폼의 색 스와치도 같은 판정을 써야 한다 — 한쪽만 고치면 "색이 있는데 스와치는 검게
 *   보이는" 형태로 갈린다. 그래서 검증과 표시가 이 상수 하나를 공유한다.
 */
export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export interface SurveyOptionDraft {
  /** 기존 선택지면 id가 있다(수정), 새로 더한 칸이면 없다 */
  id?: number;
  label: string;
  subtitle: string;
  bgColor: string;
  textColor: string;
  imagePath: string;
}

export interface SurveyDraft {
  title: string;
  /** `datetime-local` 값(KST). 비우면 DB 기본값(생성 + 7일) */
  closesAt: string;
  options: SurveyOptionDraft[];
}

export interface SurveyOptionErrors {
  label?: string;
  subtitle?: string;
  color?: string;
  imagePath?: string;
}

export interface SurveyFieldErrors {
  title?: string;
  closesAt?: string;
  options?: SurveyOptionErrors[];
  form?: string;
}

export interface SurveyInput {
  title: string;
  options: {
    id?: number;
    label: string;
    subtitle: string | null;
    bgColor: string | null;
    textColor: string | null;
    imagePath: string | null;
  }[];
}

export function validateSurvey(
  draft: SurveyDraft,
): { ok: true; value: SurveyInput } | { ok: false; errors: SurveyFieldErrors } {
  const errors: SurveyFieldErrors = {};

  // ⚠ 빈 값 판정은 `.trim()`이 아니라 `hasVisibleChar`다 — 제로폭·BOM만 담긴 제목이
  //   실제로 만들어졌던 사고 때문이고, DB의 has_visible_char와 문자 집합이 같다.
  if (!hasVisibleChar(draft.title)) {
    errors.title = "제목을 입력해 주세요.";
  } else {
    const over = lengthOverflow(draft.title, SURVEY_TITLE_LIMIT);
    if (over === "grapheme") errors.title = `제목은 ${SURVEY_TITLE_LIMIT.grapheme}자까지예요.`;
    else if (over === "codePoint") errors.title = "제목이 너무 길어요.";
  }

  if (draft.options.length < SURVEY_OPTION_MIN || draft.options.length > SURVEY_OPTION_MAX) {
    errors.form = `선택지는 ${SURVEY_OPTION_MIN}개에서 ${SURVEY_OPTION_MAX}개까지예요.`;
  }

  const optionErrors: SurveyOptionErrors[] = draft.options.map(() => ({}));
  // ⚠ **정규형으로 접어 비교한다.** 접지 않으면 DB의 unique(survey_id, label)이
  //   제로폭 문자·NBSP·꼬리 공백으로 그냥 우회되어 똑같이 생긴 선택지가 여럿 저장된다.
  const labels = draft.options.map((option) => normalizeNickname(option.label));

  draft.options.forEach((option, index) => {
    if (!hasVisibleChar(option.label)) {
      optionErrors[index].label = "선택지를 입력해 주세요.";
    } else {
      const over = lengthOverflow(option.label, SURVEY_LABEL_LIMIT);
      if (over === "grapheme") optionErrors[index].label = `${SURVEY_LABEL_LIMIT.grapheme}자까지예요.`;
      else if (over === "codePoint") optionErrors[index].label = "너무 길어요.";
      else if (labels.indexOf(labels[index]) !== index) {
        optionErrors[index].label = "같은 선택지를 두 번 쓸 수 없어요.";
      }
    }

    if (option.subtitle !== "") {
      const over = lengthOverflow(option.subtitle, SURVEY_SUBTITLE_LIMIT);
      if (over === "grapheme") optionErrors[index].subtitle = `${SURVEY_SUBTITLE_LIMIT.grapheme}자까지예요.`;
      else if (over === "codePoint") optionErrors[index].subtitle = "너무 길어요.";
    }

    // ⚠ DB CHECK가 배경색·글자색을 **쌍으로** 강제한다
    const hasBg = option.bgColor !== "";
    const hasText = option.textColor !== "";
    if (hasBg !== hasText) {
      optionErrors[index].color = "배경색과 글자색을 함께 넣어 주세요.";
    } else if (hasBg && (!HEX_COLOR_RE.test(option.bgColor) || !HEX_COLOR_RE.test(option.textColor))) {
      optionErrors[index].color = "#rrggbb 형태로 적어 주세요.";
    }
  });

  // ⚠ **한 문항 안에서 색이 전부 있거나 전무여야 한다.** 한 면만 색이 없으면
  //   `splitCount`가 분할 카드를 포기해 카드가 통째로 다른 모양이 된다.
  const colored = draft.options.filter((option) => option.bgColor !== "").length;
  if (colored !== 0 && colored !== draft.options.length) {
    errors.form = "색은 모든 선택지에 넣거나 모두 비워 주세요. 하나만 비면 분할 카드가 깨져요.";
  }

  if (optionErrors.some((error) => Object.keys(error).length > 0)) errors.options = optionErrors;
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      title: normalizeNickname(draft.title),
      options: draft.options.map((option, index) => ({
        id: option.id,
        label: labels[index],
        subtitle: option.subtitle === "" ? null : normalizeNickname(option.subtitle),
        bgColor: option.bgColor === "" ? null : option.bgColor,
        textColor: option.textColor === "" ? null : option.textColor,
        imagePath: option.imagePath === "" ? null : option.imagePath,
      })),
    },
  };
}

/** 새 칸의 초기값 — 색은 비워 두고, 한 면이라도 색을 넣으면 폼이 나머지를 요구한다 */
export function emptyOptionDraft(): SurveyOptionDraft {
  return { label: "", subtitle: "", bgColor: "", textColor: "", imagePath: "" };
}
