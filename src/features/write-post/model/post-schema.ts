import { codePointLength, hasVisibleChar, lengthOverflow, type TextLimit } from "@/shared/lib";
import { POST_CATEGORIES, type PostCategory } from "@/entities/post";

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

/** 검증을 통과한 게시글 입력 — `title`·`content`는 다듬어진 값이다 */
export interface PostInput {
  category: PostCategory;
  title: string;
  content: string;
}

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

/** 필드명 → 첫 에러 메시지 */
export type PostFieldErrors = Partial<Record<keyof PostInput, string>>;

/**
 * 말머리는 DB의 `post_category` enum이 단일 소스다 — 목록을 여기에 다시 적지 않는다.
 * ⚠ `POST_CATEGORIES`는 리터럴 튜플이라 `includes(string)`이 타입 에러다 →
 *   `readonly string[]`로 넓혀 좁힘 함수로 감싼다. 역방향 해석인 `categoryFromSlug`가
 *   같은 배열을 도는 것과 같은 형태다.
 */
function isPostCategory(value: string): value is PostCategory {
  return (POST_CATEGORIES as readonly string[]).includes(value);
}

/**
 * ⚠ **zod를 쓰지 않는다** — `validatePoll`·`validateComment`·`validateNickname`과 같은 형태다.
 *   여기서 zod가 실제로 하던 일은 `z.enum` 하나와 issue 배열을 필드별 첫 메시지로 접는
 *   배관뿐인데(검증 본체는 아래 세 헬퍼가 전부 한다), 그 대가로 zod 클래식 API 전량과
 *   cuid·ulid·ipv6·emoji 포맷 레지스트리가 **작성·수정 라우트에 70KB(gzip) 실렸다**(실측).
 *   트리셰이킹되지 않는 이유는 `"zod"` 엔트리가 그것들을 side-effect로 등록하기 때문이다.
 *
 * ⚠ "빈 값"은 보이는 글자 유무로 판정한다 — `.trim()`이 아니라 `hasVisibleChar`다.
 *   `.trim()`도 Postgres `[:space:]`도 제로폭 문자·BOM을 못 걸러서 **제목이 완전히
 *   비어 보이는 글**이 실제로 만들어졌다. DB의 `public.has_visible_char`와 문자 집합이
 *   같아야 하므로 한쪽만 고치지 말 것.
 *
 * ⚠ 검사 순서가 규약이다 — **그래핌을 먼저** 봐야 일반 사용자에게 한도 숫자가 담긴 문구가 간다.
 *   코드포인트 초과 문구("너무 길어요")는 결합 문자를 쌓지 않는 한 도달할 수 없다.
 * ⚠ `graphemeLength(v) > MAX`를 직접 짜지 않는다 — 판정은 `lengthOverflow`가 소유한다.
 *   본문만 `TextLimit`이 아니라 코드포인트 단일이라 `codePointLength`로 직접 잰다(위 상수 주석).
 */
export function validatePost(
  draft: PostDraft,
): { ok: true; value: PostInput } | { ok: false; errors: PostFieldErrors } {
  const errors: PostFieldErrors = {};

  // 미선택(빈 문자열)도 여기서 걸린다: DB에는 default가 없어 23502로 거부되지만,
  // 사용자에게는 그 전에 한국어로 알려준다.
  const category = draft.category;
  if (!isPostCategory(category)) errors.category = "말머리를 하나 골라 주세요.";

  const title = draft.title.trim();
  if (!hasVisibleChar(title)) {
    errors.title = "제목을 입력해 주세요.";
  } else {
    const over = lengthOverflow(title, TITLE_LIMIT);
    if (over) {
      errors.title =
        over === "grapheme"
          ? `제목은 ${TITLE_LIMIT.grapheme}자까지 쓸 수 있어요.`
          : "제목이 너무 길어요.";
    }
  }

  const content = draft.content.trim();
  if (!hasVisibleChar(content)) {
    errors.content = "내용을 입력해 주세요.";
  } else if (codePointLength(content) > CONTENT_MAX) {
    errors.content = `내용은 ${CONTENT_MAX}자까지 쓸 수 있어요.`;
  }

  if (!isPostCategory(category) || errors.title || errors.content) return { ok: false, errors };
  return { ok: true, value: { category, title, content } };
}
