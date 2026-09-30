/**
 * `searchParams` 값 하나 — 같은 키가 여러 번 오면 **첫 값**, 없으면 `null`.
 *
 * 서버 page(`/profile`·`/sign-in`)가 같은 판정을 쓴다 — 페이지마다 따로 짜면 한쪽은 첫 값을 취하고 다른 쪽은
 * 배열이면 통째로 버려 같은 URL이 페이지마다 다르게 읽힌다.
 * 순수 함수라 서버 안전하다 — 배럴이 아니라 `@/shared/lib/search-params` 직접 경로로.
 */
export function firstParam(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}
