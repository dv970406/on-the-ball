import { z } from "zod";
import { codePointLength, hasVisibleChar } from "@/shared/lib/text";

/**
 * 게시글 입력 검증 — 작성·수정 공용.
 *
 * ⚠ 이건 UX이지 방어가 아니다. 같은 한계를 DB의 check 제약이 다시 건다
 *   (board_init 마이그레이션의 char_length 검사). 클라이언트를 우회해도 DB가 막는다.
 *   두 값이 어긋나면 클라는 통과하고 서버가 거부하므로 함께 바꾼다.
 */
export const TITLE_MAX = 120;
export const CONTENT_MAX = 20000;

/**
 * 길이는 코드포인트로, "빈 값"은 보이는 글자 유무로 판정한다.
 * 둘 다 DB 제약과 **같은 기준**이라 shared/lib/text에 단일 소스로 둔다.
 */
export const postSchema = z.object({
  title: z
    .string()
    .trim()
    .refine(hasVisibleChar, "제목을 입력해 주세요.")
    .refine(
      (value) => codePointLength(value) <= TITLE_MAX,
      `제목은 ${TITLE_MAX}자까지 쓸 수 있어요.`,
    ),
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

/** 필드명 → 첫 에러 메시지 (zod의 issue 배열을 폼이 쓰기 좋은 형태로) */
export type PostFieldErrors = Partial<Record<keyof PostInput, string>>;

export function validatePost(
  input: PostInput,
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
