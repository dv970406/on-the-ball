import { hasVisibleChar, lengthOverflow, type TextLimit } from "@/shared/lib";

/**
 * 가리는 사유의 길이 한도 — **두 단위로 겹쳐 건다**(화면=그래핌, DB=코드포인트 K=10배).
 *
 * ⚠ `post_moderation.reason`의 CHECK가 `char_length between 1 and 200`이다. 클라이언트가
 *   재지 않으면 DB의 23514가 그대로 나가고 `toDbErrorMessage`가 "입력값이 허용 범위를
 *   벗어났어요."로 접어 **어느 칸이 문제인지 말하지 못한다**(`api-and-db.md`의 길이 한도 절).
 * ⚠ **어드민 전용 화면이라고 예외가 아니다** — 같은 화면의 투표 라벨 편집기가 이미 겹쳐 건다.
 *   이 값은 그 문서의 한도 표에도 한 줄로 올라간다.
 */
export const MASK_REASON_LIMIT: TextLimit = { grapheme: 20, codePoint: 200 };

/**
 * 가리는 사유 검증 — 문구만 돌려주고 뷰는 그것을 그린다(검증은 features가 소유한다).
 *
 * ⚠ **선택 입력이라 빈 값은 통과한다.** 사유 없이 가리는 것이 정상 경로이고, 그때 훅이
 *   `p_reason`을 아예 싣지 않는다.
 * ⚠ 빈 값 판정은 `.trim()`이 아니라 `hasVisibleChar`다 — 제로폭 문자만 담긴 사유는 trim을
 *   통과해 본문에 `사유: ` 뒤가 비어 보이는 안내를 남긴다.
 */
export function validateMaskReason(value: string): string | null {
  if (!hasVisibleChar(value)) return null;

  const over = lengthOverflow(value, MASK_REASON_LIMIT);
  if (over === "grapheme") return `사유는 ${MASK_REASON_LIMIT.grapheme}자까지예요.`;
  // 코드포인트 초과는 결합 문자를 쌓지 않는 한 도달할 수 없다 → 길이로만 말한다.
  if (over === "codePoint") return "사유가 너무 길어요.";
  return null;
}
