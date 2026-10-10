/**
 * 선수 키의 정규형 — NFD → 결합문자 제거 → 분해되지 않는 라틴 글자 옮기기 → 소문자 → 비영숫자 제거 → 공백 하나로 접는다.
 *
 * ⚠ `ø·æ·ß·ł` 같은 글자는 NFD로 분해되지 않아 그대로 지우면 이름이 깨진다 — "Højbjerg"가 `hjbjerg`가 되어
 * "Hojbjerg"로 쓴 보도와 다른 딜로 갈렸다. 지우기 전에 라틴 글자로 옮긴다(`LATIN_FOLD`).
 *
 * 이 값이 `transfer_deal.deal_key`(영구 계약 — 관심 FK가 이 id를 본다)·`players-ko.json`의 키·
 * LLM 판정 캐시 키를 **전부** 만든다. ⚠ 의존이 없는 리프 모듈이다 — `derive-deals`·`judge`가 함께
 * import한다. 한쪽에만 두면 순환 import를 피하려 복제본이 생기고, 둘이 한 글자라도 갈리면 판정 캐시가
 * 딜과 다른 선수에 붙는다.
 */
const LATIN_FOLD = { ø: "o", Ø: "o", æ: "ae", Æ: "ae", œ: "oe", Œ: "oe", ß: "ss", ł: "l", Ł: "l", đ: "d", Đ: "d", ð: "d", Ð: "d", þ: "th", Þ: "th", ı: "i" };
export function normalizePlayer(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[øØæÆœŒßłŁđĐðÐþÞı]/g, (c) => LATIN_FOLD[c])
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
