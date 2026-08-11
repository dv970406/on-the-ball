/**
 * 사용자 입력 텍스트 판정 — 게시글·댓글·DB 제약이 **같은 기준**을 써야 하는 것들만 둔다.
 * (parsePostId를 proxy와 페이지가 공유하는 것과 같은 이유다 — 기준이 갈리면 한쪽만 통과한다)
 *
 * 예외가 하나 있다: `graphemeLength`는 **DB에 대응물이 없는** 표시 전용 단위다.
 * 그래서 한도는 `TextLimit`(그래핌·코드포인트 한 쌍)로 두고 `lengthOverflow`가 둘 다 본다.
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
 *
 * ⚠ **이걸 `graphemeLength`로 대체하지 말 것.** 사용자에게 보이는 한도는 그래핌이지만
 *   DB가 강제하는 단위는 여전히 코드포인트라, 두 검사는 **함께** 가야 한다 → `lengthOverflow`.
 */
export function codePointLength(value: string): number {
  return [...value].length;
}

/**
 * 생성 비용이 있어 모듈 스코프에 한 번만 만든다(정규식을 hoist하는 것과 같은 이유).
 * 요청별 가변 상태를 담지 않아 서버에서 공유해도 안전하다 — `segment()`가 매번 새 값을 낸다.
 *
 * ⚠ 로캘을 고정한다. 그래핌 경계는 로캘에 의존하지 않지만, 인자를 비우면 사용자 로캘을
 *   따라가므로 기기마다 판정이 달라질 여지를 남기지 않는다.
 */
const graphemeSegmenter =
  typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("ko", { granularity: "grapheme" })
    : null;

/**
 * 그래핌(사용자가 세는 "한 글자") 기준 길이 — **화면에 보이는 한도**가 쓰는 단위다.
 *
 * 코드포인트로 세면 사용자가 한 글자로 보는 이모지가 여럿으로 세어진다(실측):
 *   ⚽ 1 / 👍🏽·🇰🇷·❤️ 2 / 👨‍👩‍👧‍👦·🏴󠁧󠁢󠁳󠁣󠁴󠁿 7 / 👨🏻‍❤️‍💋‍👨🏽 10
 * UAX #29 확장 그래핌 클러스터는 ZWJ 시퀀스·피부톤·국기·키캡·태그 시퀀스를 전부 1로 센다.
 *
 * ⚠ **이 함수만으로 한도를 걸면 안 된다.** 1그래핌의 코드포인트 수에는 상한이 없어서
 *   (`a` + 결합악센트 50개 = 그래핌 1 / 코드포인트 51), 그래핌 한도는 DB `char_length`
 *   한도를 함의하지 못한다. 게다가 PostgreSQL에는 그래핌 분절이 아예 없어 DB를 이 단위로
 *   맞출 수도 없다. → 한도를 걸 때는 이 함수를 직접 부르지 말고 **`lengthOverflow`** 를 쓴다.
 *
 * ⚠ `Intl.Segmenter`가 없으면 `codePointLength`로 폴백한다. 그래핌 ≤ 코드포인트라
 *   폴백은 항상 **더 엄격한** 쪽으로 기울고, 그래서 "클라는 통과시켰는데 DB가 거부"를
 *   만들지 않는다 — 폴백이 안전한 이유가 이 부등호다.
 *
 * ⚠ 긴 문자열에는 비싸다 — 20,000자 기준 1.5ms로 `codePointLength`(0.1ms)의 14배다(실측).
 *   그래서 본문(20,000자 한도)에는 쓰지 않는다. 제목 120자는 0.011ms라 렌더 중에도 무방하다.
 */
export function graphemeLength(value: string): number {
  if (!graphemeSegmenter) return codePointLength(value);
  // 배열로 펼치지 않고 이터레이터만 돌린다 — 세는 게 목적이라 세그먼트를 담아둘 이유가 없다.
  const segments = graphemeSegmenter.segment(value)[Symbol.iterator]();
  let count = 0;
  while (!segments.next().done) count += 1;
  return count;
}

/**
 * 길이 한도 **한 쌍** — 화면 단위와 DB 단위는 항상 함께 간다.
 *
 * 두 값을 `MAX`·`MAX_CODEPOINT`로 따로 두면 한쪽만 검사하기가 자연스러워지는데,
 * 이 설계의 안전 속성 전체가 "둘 다 건다"에 달려 있다. 그래서 한도를 **하나의 값**으로 묶고
 * 판정도 `lengthOverflow` 하나가 소유한다(`parsePostId`·`safeNextPath`와 같은 이유 —
 * 두 곳이 같아야 하는 규약은 함수 하나가 갖는다).
 */
export interface TextLimit {
  /** 사용자에게 보이는 한도. 어떤 이모지도 1자로 센다 */
  grapheme: number;
  /** DB `char_length` CHECK와 **같은 값**. 화면 한도의 K=10배로 둔다 */
  codePoint: number;
}

/**
 * 두 한도를 검사해 넘친 쪽을 돌려준다(`null`이면 통과).
 *
 * ⚠ **직접 `graphemeLength(v) > MAX`를 짜지 말 것.** 코드포인트 검사를 빠뜨려도
 *   컴파일·린트·RLS 검사 어느 것도 잡아주지 않고, 그 순간 사용자는 한국어 안내 대신
 *   DB의 23514(또는 btree 인덱스의 영어 에러)를 보게 된다.
 *
 * ⚠ 문구는 만들지 않는다 — 자리마다 다르므로 호출부가 종류만 받아 자기 문구를 쓴다.
 *   그래핌 초과는 "N자까지 쓸 수 있어요", 코드포인트 초과는 "너무 길어요"가 관례다
 *   (후자는 결합 문자를 쌓지 않는 한 도달할 수 없다).
 *
 * ⚠ 검사 순서가 규약이다. 그래핌을 먼저 봐야 일반 사용자에게 **한도 숫자가 담긴** 문구가 간다.
 */
export function lengthOverflow(
  value: string,
  limit: TextLimit,
): "grapheme" | "codePoint" | null {
  if (graphemeLength(value) > limit.grapheme) return "grapheme";
  if (codePointLength(value) > limit.codePoint) return "codePoint";
  return null;
}

/**
 * 지우는 문자 집합 — `normalize_nickname`의 1)단계와 **글자 하나까지 같아야 한다**
 * (`supabase/migrations/20260807000001_oauth_nickname.sql`).
 */
const INVISIBLE = new RegExp(
  "[\\u0001-\\u0008\\u000E-\\u001F\\u007F-\\u009F\\u00AD\\u034F\\u061C\\u180E" +
    "\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u206A-\\u206F\\uFEFF]",
  "gu",
);
/** 빈 자리를 그리는 문자 → 보통 공백. `normalize_nickname`의 2)단계와 같은 집합이다. */
const BLANK = new RegExp(
  "[\\u0009-\\u000D\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000]",
  "gu",
);

/**
 * 닉네임 정규형 — **DB의 `public.normalize_nickname`과 같은 결과**를 낸다.
 *
 * ⚠ 왜 클라이언트에도 필요한가: 길이 검사를 원본으로 하면 판정이 갈린다. 가족 이모지
 *   (👨‍👩‍👧‍👦)는 ZWJ 3개를 포함해 코드포인트 7개인데 DB는 ZWJ를 지우고 4로 센다 →
 *   3개만 붙여도 클라이언트는 21자로 보고 거부하지만 **서버는 12자로 받아들인다.**
 *
 * ⚠ 위 두 문자 집합은 마이그레이션과 **한 쌍**이다. 한쪽만 고치면 다시 갈린다.
 *   합집합이 `hasVisibleChar`의 클래스와 같아야 한다는 제약도 그대로다.
 */
export function normalizeNickname(value: string): string {
  return value
    .replace(INVISIBLE, "")
    .replace(BLANK, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}
