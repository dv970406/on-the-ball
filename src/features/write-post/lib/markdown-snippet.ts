/**
 * 커서 자리에 끼워 넣을 조각. `caret`은 `text` 시작점 기준 오프셋 [start, end] —
 * 없으면 삽입 끝에 둔다.
 *
 * ⚠ 타입이 `ui/use-cursor-insert`가 아니라 **여기** 있다. 이 값을 만드는 것은 아래 순수
 *   함수들이고, 훅은 받아서 쓸 뿐이다 — 반대로 두면 `lib/`(순수 유틸)가 `ui/`를 참조하는
 *   계층 역전이 된다.
 */
export interface Insertion {
  text: string;
  caret?: [number, number];
}

/**
 * 마크다운 조각을 만드는 순수 함수들.
 *
 * ⚠ **호출부가 문자열을 직접 잇지 않는다.** 라벨의 `]` 하나, URL의 `)` 하나면 링크 문법이
 *   그 자리에서 끊겨 본문에 대괄호와 괄호가 그대로 노출된다. 이스케이프 규칙을 여러 곳에
 *   흩으면 한 곳만 빠뜨려도 같은 증상이 돌아온다(`lengthOverflow`와 같은 이유).
 */

/**
 * 링크 라벨을 안전하게 만든다 — 대괄호를 이스케이프하고 줄바꿈을 공백으로 접는다.
 * (라벨 안의 줄바꿈은 링크를 통째로 깨뜨린다)
 */
export function escapeLinkLabel(label: string): string {
  return label.replace(/[\\[\]]/g, "\\$&").replace(/\s+/g, " ").trim();
}

/**
 * URL의 괄호를 퍼센트 인코딩한다.
 * ⚠ 여는 괄호도 함께 인코딩한다 — 짝이 맞아도 파서가 중첩을 끝까지 세지는 않는다.
 */
export function encodeMarkdownUrl(href: string): string {
  return href.replace(/\(/g, "%28").replace(/\)/g, "%29");
}

/**
 * `[라벨](url)`. 라벨이 비면 URL을 라벨로 쓴다(빈 라벨은 스크린리더에 읽히지 않는다).
 * 캐럿은 라벨을 선택한 채 둔다 — 삽입 직후 가장 고치고 싶은 자리가 거기다.
 */
export function linkInsertion(label: string, href: string): Insertion {
  // ⚠ 폴백에도 **반드시 이스케이프를 태운다.** 한때 `escapeLinkLabel(label) || href`였는데,
  //   표시 텍스트를 비우고 주소에 `]`가 있으면(`https://ex.com/a]b`) 그 자리에서 문법이 끊겨
  //   본문에 대괄호가 노출되고 **사용자가 넣지 않은 주소의 링크**까지 만들어졌다(실측).
  const safeLabel = escapeLinkLabel(label) || escapeLinkLabel(href);
  return {
    text: `[${safeLabel}](${encodeMarkdownUrl(href)})`,
    caret: [1, 1 + safeLabel.length],
  };
}
