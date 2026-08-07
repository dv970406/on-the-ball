/**
 * 사용자 입력 텍스트 판정 — 게시글·댓글·DB 제약이 **같은 기준**을 써야 하는 것들만 둔다.
 * (parsePostId를 proxy와 페이지가 공유하는 것과 같은 이유다 — 기준이 갈리면 한쪽만 통과한다)
 */

/**
 * "보이는 글자" 하나 — 아래 목록에 **없는** 문자.
 *
 * ⚠ 문자 집합을 `\s`나 Postgres `[:space:]` 같은 **약칭에 기대지 않고 전부 열거한다.**
 *   두 약칭이 서로 다른 문자를 포함하고(예: `\s`에는 U+200B가 없다), 게다가
 *   Postgres의 `[:space:]`는 **DB collation에 따라 결과가 달라진다** — NBSP(U+00A0)가
 *   ICU 로캘에서는 공백이지만 libc `en_US.utf8`·`C`에서는 아니었다(실측).
 *   로컬에서만 통과하고 프로덕션에서 구멍이 열리는 종류의 차이라 열거로 못박는다.
 *
 * ⚠ `supabase/migrations/20260802000001_blank_text_guard.sql`의 `public.has_visible_char`와
 *   **글자 하나까지 같아야 한다.** 한쪽만 고치면 클라이언트와 DB의 판정이 갈린다.
 *
 * 구성: C0/C1 제어문자 + 모든 공백류 + 화면에 아무것도 그리지 않는 서식 문자
 *   U+0001–U+0020 제어문자·스페이스 / U+007F–U+00A0 DEL·C1·NBSP / U+00AD soft hyphen
 *   U+034F combining grapheme joiner / U+061C arabic letter mark / U+1680 ogham space
 *   U+180E mongolian vowel separator / U+2000–U+200F 각종 공백·제로폭·양방향 마크
 *   U+2028–U+202F 줄·문단 구분자·양방향 제어·NNBSP / U+205F medium math space
 *   U+2060–U+2064 word joiner 계열 / U+206A–U+206F 비추천 서식 문자
 *   U+3000 전각 공백 / U+FEFF BOM
 * (U+0000은 Postgres text가 담을 수 없어 범위를 U+0001부터 잡는다)
 */
const VISIBLE_CHAR = new RegExp(
  "[^\\u0001-\\u0020\\u007F-\\u00A0\\u00AD\\u034F\\u061C\\u1680\\u180E" +
    "\\u2000-\\u200F\\u2028-\\u202F\\u205F\\u2060-\\u2064\\u206A-\\u206F\\u3000\\uFEFF]",
  "u",
);

/**
 * 보이는 글자가 하나라도 있는지.
 *
 * ⚠ `.trim()`이나 `char_length` 검사만으로는 부족하다 — 제로폭 공백(U+200B)·BOM(U+FEFF)을
 *   둘 다 걸러내지 못해서 **제목이 완전히 비어 보이는 글**이 실제로 만들어졌다
 *   (`<title>﻿ | 온더볼</title>`).
 */
export function hasVisibleChar(value: string): boolean {
  return VISIBLE_CHAR.test(value);
}

/**
 * 코드포인트 기준 길이 — DB `char_length`와 **같은 단위**다.
 *
 * ⚠ JS의 `String.length`와 `<input maxLength>`는 UTF-16 코드유닛을 센다. 이모지는
 *   서로게이트 페어라 2로 세어져, DB가 120자를 허용하는데 화면에서는 이모지 60개에서 막혔다.
 */
export function codePointLength(value: string): number {
  return [...value].length;
}
