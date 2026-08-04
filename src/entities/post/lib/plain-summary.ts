/**
 * 마크다운 원문 → 평문 요약. 순수 함수라 서버에서도 import할 수 있다("use client" 없음).
 *
 * 소비처가 둘이라 여기로 승격했다(중복 구현 금지 — reuse.md):
 *   - app/posts/[id]/page.tsx  : og:description(공유 프리뷰)
 *   - entities/post/api/mappers: 목록 카드의 발췌 2행
 * 두 곳이 서로 다른 변환기를 쓰면 같은 글의 요약이 화면과 공유 프리뷰에서 달라진다.
 */

/** 길면 말줄임 — 잘린 자리에 …를 남겨 원문이 더 있음을 알린다 */
export function clamp(text: string, max: number): string {
  // ⚠ 코드포인트 단위로 센다. .length(UTF-16 코드유닛)로 자르면 이모지가 반쪽으로 잘린다.
  const chars = [...text.trim()];
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("")}…`;
}

/**
 * 마크다운 기호를 걷어내 한 줄 평문으로 만든다.
 * 렌더러를 돌리지 않는다 — 서버에서 react-markdown을 태울 이유가 없다.
 *
 * ⚠ 입력이 DB의 excerpt(= content의 앞 300자 프리픽스)면 중간에서 잘린 상태라
 *   짝이 맞지 않는 기호가 남을 수 있다. 그래서 강조 기호는 짝을 따지지 않고 전부 제거한다.
 */
export function toPlainSummary(markdown: string, max: number): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, " ") // 펜스 코드블록
    .replace(/`([^`]*)`/g, "$1") // 인라인 코드
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // 이미지
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // 링크는 텍스트만
    .replace(/^\s{0,3}>+\s?/gm, "") // 인용
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // 헤딩
    .replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, "") // 목록 마커
    .replace(/^\s{0,3}([-*_])\s*(\1\s*){2,}$/gm, " ") // 수평선
    // GFM 표: 구분 행(|---|:--:|)을 통째로 버리고 남은 셀 구분자는 공백으로.
    // 안 하면 목록 발췌에 `| 선수 | 잔여계약 | |---|---|`가 그대로 찍힌다(실측).
    .replace(/^\s{0,3}\|?[\s:|-]*\|[\s:|-]*$/gm, " ")
    .replace(/\|/g, " ")
    .replace(/[*_~]/g, "") // 강조 기호
    .replace(/\s+/g, " ");
  return clamp(plain, max);
}
