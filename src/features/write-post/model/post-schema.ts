import { z } from "zod";
import { codePointLength, hasVisibleChar } from "@/shared/lib";
import { POST_CATEGORIES } from "@/entities/post";

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
  // 말머리는 DB의 post_category enum이 단일 소스다 — 목록을 여기에 다시 적지 않는다.
  // 미선택(빈 문자열)도 여기서 걸린다: DB에는 default가 없어 23502로 거부되지만,
  // 사용자에게는 그 전에 한국어로 알려준다.
  category: z.enum(POST_CATEGORIES, { message: "말머리를 하나 골라 주세요." }),
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
