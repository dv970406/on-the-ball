import type { Database } from "@/types/database.types";

/** 값 목록의 단일 소스는 DB enum이다 — 손으로 다시 적지 않는다 */
export type ReportReason = Database["public"]["Enums"]["report_reason"];

/**
 * 시트에 보이는 순서.
 * satisfies로 묶어 두어 enum에 없는 값을 적으면 컴파일 에러가 난다.
 */
export const REPORT_REASONS = [
  "spam",
  "abuse",
  "sexual",
  "false_info",
  "etc",
] as const satisfies readonly ReportReason[];

/**
 * ⚠ **반대 방향을 막는 검사다.** `satisfies`는 "없는 값을 적으면" 잡지만 "enum에 있는 값을
 *   빠뜨리면" 못 잡는다. 그대로 두면 `alter type ... add value`로 사유를 추가하고 위 배열에
 *   안 넣었을 때 **시트에서 조용히 빠진다.** `POST_CATEGORIES`와 같은 형태·같은 이유다.
 *
 * ⚠ 타입 별칭만 선언하면 아무것도 검사하지 못한다(`type X = never`는 그냥 선언일 뿐이다) —
 *   실제 값에 할당해야 컴파일러가 대조한다.
 * ⚠ **아무도 읽지 않는다고 지우지 말 것 — 선언 자체가 검사다**(`POST_CATEGORIES`와 같은 형태).
 */
const _REASONS_EXHAUSTIVE: Exclude<ReportReason, (typeof REPORT_REASONS)[number]> extends never
  ? true
  : never = true;

/**
 * 화면 문구.
 *
 * ⚠ DB enum이 **영문 키**인 이유가 이 맵이다 — 사유는 문장으로 보여야 하는데, 저장값을
 *   문장으로 두면 문구를 다듬을 때마다 enum을 바꿔야 한다(`post_category`가 한국어인 것과
 *   갈리는 지점: 말머리는 화면에 그 단어 그대로 나가는 라벨이다).
 *
 * `Record<ReportReason, string>`이라 사유를 추가하면 라벨 누락이 컴파일 에러로 잡힌다.
 */
export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  spam: "스팸이거나 광고예요",
  abuse: "욕설·비방이에요",
  sexual: "음란물이거나 선정적이에요",
  false_info: "허위 정보예요",
  etc: "기타",
};
