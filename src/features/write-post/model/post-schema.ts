import { z } from "zod";
import { codePointLength, hasVisibleChar, lengthOverflow, type TextLimit } from "@/shared/lib";
import { POST_CATEGORIES } from "@/entities/post";

/**
 * 게시글 입력 검증 — 작성·수정 공용.
 *
 * ⚠ 이건 UX이지 방어가 아니다. 다만 **DB가 거는 한계와 단위도 값도 다르다** —
 *   사용자에게 보이는 한도는 그래핌이고 클라이언트만 강제한다. DB는 같은 자리에
 *   코드포인트 abuse bound(K=10배)를 걸어 우회 삽입을 막는다.
 *   짝이 되는 마이그레이션은 `20260810000001_grapheme_length_bounds.sql`이고,
 *   규약 전체는 `docs/conventions/api-and-db.md`의 "길이 한도는 두 단위로 겹쳐 건다".
 */

/**
 * 제목 한도 — 화면 120그래핌 / DB 1,200코드포인트(`post_title_check`와 같은 값).
 * ⚠ 두 값은 **함께** 검사해야 한다. 판정은 `lengthOverflow`가 소유한다.
 */
export const TITLE_LIMIT: TextLimit = { grapheme: 120, codePoint: 1200 };

/**
 * 본문 — **일부러 코드포인트 단일이다.** 20,000자는 한도가 넓어 이모지가 체감되지 않는데,
 * 가장 큰 컬럼이라 DB abuse bound를 10배로 푸는 대가가 크다. 성능도 걸린다 —
 * 20,000자 그래핌 계산은 1.5ms로 코드포인트(0.1ms)의 14배라 키 입력마다 돌릴 수 없다.
 * 그래서 여기만 `TextLimit`이 아니라 단일 상수다.
 */
export const CONTENT_MAX = 20000;

/**
 * "빈 값"은 보이는 글자 유무로 판정한다(DB `has_visible_char`와 같은 문자 집합).
 * 길이는 제목이 이중(그래핌+코드포인트), 본문이 단일(코드포인트)이다 — 이유는 위 상수 주석.
 */
export const postSchema = z.object({
  // 말머리는 DB의 post_category enum이 단일 소스다 — 목록을 여기에 다시 적지 않는다.
  // 미선택(빈 문자열)도 여기서 걸린다: DB에는 default가 없어 23502로 거부되지만,
  // 사용자에게는 그 전에 한국어로 알려준다.
  category: z.enum(POST_CATEGORIES, { message: "말머리를 하나 골라 주세요." }),
  title: z
    .string()
    .trim()
    .refine(hasVisibleChar, "제목을 입력해 주세요.")
    // ⚠ refine 두 개로 나누지 않는다 — 그러면 그래핌 길이를 두 번 세게 되고,
    //   무엇보다 한쪽만 남기는 수정이 쉬워진다. 판정은 lengthOverflow 하나에 맡긴다.
    .superRefine((value, ctx) => {
      const over = lengthOverflow(value, TITLE_LIMIT);
      if (!over) return;
      ctx.addIssue({
        code: "custom",
        // 코드포인트 초과는 결합 문자를 쌓지 않는 한 도달할 수 없다 → 길이로만 말한다.
        message:
          over === "grapheme"
            ? `제목은 ${TITLE_LIMIT.grapheme}자까지 쓸 수 있어요.`
            : "제목이 너무 길어요.",
      });
    }),
  content: z
    .string()
    .trim()
    .refine(hasVisibleChar, "내용을 입력해 주세요.")
    .refine(
      (value) => codePointLength(value) <= CONTENT_MAX,
      `내용은 ${CONTENT_MAX}자까지 쓸 수 있어요.`,
    ),
});

export type PostInput = z.infer<typeof postSchema>;

/**
 * 폼이 들고 있는 **검증 전** 값.
 * 말머리는 미선택 상태("")를 가질 수 있어 PostInput과 형태가 다르다 —
 * 그 미선택을 걸러내는 것이 validatePost의 일이므로 입력 타입을 좁히면 안 된다.
 */
export interface PostDraft {
  category: string;
  title: string;
  content: string;
}

/** 필드명 → 첫 에러 메시지 (zod의 issue 배열을 폼이 쓰기 좋은 형태로) */
export type PostFieldErrors = Partial<Record<keyof PostInput, string>>;

export function validatePost(
  input: PostDraft,
): { ok: true; value: PostInput } | { ok: false; errors: PostFieldErrors } {
  const result = postSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };

  const errors: PostFieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof PostInput | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
