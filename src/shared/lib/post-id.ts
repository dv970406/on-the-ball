/**
 * URL의 `[id]` 세그먼트 → 정수 id(딜 상세 등). 이름은 첫 호출자(게시글)를 기록할 뿐이다.
 *
 * ⚠ **이 id를 해석하는 곳은 전부 같은 파서를 써야 한다.**
 *   `Number()`는 `1e3`·`0x10`·`1.0`을 받아들이므로, 한 곳은 정규식으로 다른 곳은 `Number()`로
 *   판정하면 두 판정이 어긋나 서버 가드를 그냥 통과한다(실측 확인).
 *
 * 그래서 표기를 **십진수 하나로 못박는다.** 선행 0도 거부해 같은 리소스가
 * `/transfers/2`·`/transfers/002`·`/transfers/2.0` 여러 URL로 노출되는 것도 함께 막는다.
 * (id는 `generated always as identity`라 1부터 시작한다)
 */
const POST_ID_PATTERN = /^[1-9][0-9]*$/;

export function parsePostId(segment: string): number | null {
  if (!POST_ID_PATTERN.test(segment)) return null;
  const id = Number(segment);
  return Number.isSafeInteger(id) ? id : null;
}
