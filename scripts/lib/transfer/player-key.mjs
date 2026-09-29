/**
 * 선수 키의 정규형 — NFD → 결합문자 제거 → 소문자 → 비영숫자 제거 → 공백 하나로 접는다.
 *
 * 이 값이 `transfer_deal.deal_key`(영구 계약 — 관심 FK가 이 id를 본다)·`players-ko.json`의 키·
 * LLM 판정 캐시 키를 **전부** 만든다. ⚠ 의존이 없는 리프 모듈이다 — `derive-deals`·`judge`가 함께
 * import한다. 한쪽에만 두면 순환 import를 피하려 복제본이 생기고, 둘이 한 글자라도 갈리면 판정 캐시가
 * 딜과 다른 선수에 붙는다.
 */
export function normalizePlayer(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
