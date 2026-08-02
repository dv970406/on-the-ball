/**
 * URL의 `[id]` 세그먼트 → 게시글 id.
 *
 * ⚠ **proxy(서버 가드)와 페이지가 반드시 같은 파서를 써야 한다.**
 *   전에는 proxy가 `\d+` 정규식으로, 페이지가 `Number(id)`로 판정했다.
 *   `Number()`는 `1e3`·`0x10`·`1.0`을 받아들이므로 두 판정이 어긋나
 *   `/posts/1e3/edit`이 서버 가드를 그냥 통과했다(실측 확인).
 *
 * 그래서 표기를 **십진수 하나로 못박는다.** 선행 0도 거부해 같은 글이
 * `/posts/2`·`/posts/002`·`/posts/2.0` 여러 URL로 노출되는 것도 함께 막는다.
 * (id는 `generated always as identity`라 1부터 시작한다)
 */
const POST_ID_PATTERN = /^[1-9][0-9]*$/;

export function parsePostId(segment: string): number | null {
  if (!POST_ID_PATTERN.test(segment)) return null;
  const id = Number(segment);
  return Number.isSafeInteger(id) ? id : null;
}
