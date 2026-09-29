/**
 * `searchParams` 값 하나 — 같은 키가 여러 번 오면 **첫 값**, 없으면 `null`.
 *
 * 서버 page(`/profile`·`/sign-in`·`/transfers`)가 같은 판정을 쓴다 — 전에는 두 페이지가 첫 값을 취하고
 * 한 페이지는 배열이면 통째로 버려 같은 URL이 페이지마다 다르게 읽혔다.
 * 순수 함수라 서버 안전하다 — 배럴이 아니라 `@/shared/lib/search-params` 직접 경로로.
 */
export function firstParam(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}
