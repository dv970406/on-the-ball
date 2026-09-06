import { codePointLength, hasVisibleChar, lengthOverflow, type TextLimit } from "@/shared/lib";
import type { NoticeType } from "@/entities/notice";

/**
 * 길이 한도 — 두 단위로 겹쳐 건다(화면=그래핌, DB=코드포인트 K=10배).
 * 제목은 글 제목과 같은 값이고, 본문은 글 본문과 같이 **코드포인트 단일**이다
 * (20,000자 그래핌 계산이 1.5ms로 14배라 키 입력마다 돌릴 수 없다).
 */
export const NOTICE_TITLE_LIMIT: TextLimit = { grapheme: 120, codePoint: 1200 };
export const NOTICE_BODY_MAX = 20000;

export interface NoticeDraft {
  type: NoticeType;
  title: string;
  body: string;
  /** `datetime-local` 값(KST). 비우면 지금부터 */
  opensAt: string;
  /** 비우면 무기한 */
  closesAt: string;
}

export type NoticeFieldErrors = Partial<Record<keyof NoticeDraft | "form", string>>;

export interface NoticeInput {
  type: NoticeType;
  title: string;
  body: string;
  /** ISO 또는 null(=지금부터) */
  opensAt: string | null;
  /** ISO 또는 null(=무기한) */
  closesAt: string | null;
}

/**
 * ⚠ **`nowMs`를 인자로 받는다.** 시작 시각을 비웠을 때의 기준이 필요한데, 함수 안에서
 *   `Date.now()`를 읽으면 이 코드베이스의 관례(시각 의존 판정은 전부 `nowMs`를 받는다)와
 *   갈린다 — `isSurveyOpen`·`isHotPost`·`noticeVisibility`가 모두 그 형태다.
 */
export function validateNotice(
  draft: NoticeDraft,
  toIso: (value: string) => string | null,
  nowMs: number,
): { ok: true; value: NoticeInput } | { ok: false; errors: NoticeFieldErrors } {
  const errors: NoticeFieldErrors = {};

  if (!hasVisibleChar(draft.title)) {
    errors.title = "제목을 입력해 주세요.";
  } else {
    const over = lengthOverflow(draft.title, NOTICE_TITLE_LIMIT);
    if (over === "grapheme") errors.title = `제목은 ${NOTICE_TITLE_LIMIT.grapheme}자까지예요.`;
    else if (over === "codePoint") errors.title = "제목이 너무 길어요.";
  }

  if (!hasVisibleChar(draft.body)) {
    errors.body = "내용을 입력해 주세요.";
  } else if (codePointLength(draft.body) > NOTICE_BODY_MAX) {
    errors.body = "내용이 너무 길어요.";
  }

  const opensAt = draft.opensAt === "" ? null : toIso(draft.opensAt);
  if (draft.opensAt !== "" && opensAt === null) errors.opensAt = "시작 시각을 확인해 주세요.";

  const closesAt = draft.closesAt === "" ? null : toIso(draft.closesAt);
  if (draft.closesAt !== "" && closesAt === null) errors.closesAt = "종료 시각을 확인해 주세요.";

  // ⚠ DB CHECK(`closes_at > opens_at`)와 한 쌍이다 — 여기서 막지 않으면 영어 23514가 나간다
  if (closesAt !== null) {
    const start = opensAt === null ? nowMs : new Date(opensAt).getTime();
    if (new Date(closesAt).getTime() <= start) {
      errors.closesAt = "종료는 시작보다 뒤여야 해요.";
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { type: draft.type, title: draft.title, body: draft.body, opensAt, closesAt },
  };
}
