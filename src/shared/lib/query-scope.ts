/**
 * 쿼리 키의 **사용자 스코프 조각**.
 *
 * ⚠ 비로그인은 `userId`가 `undefined`인데, 그대로 키에 넣으면 TanStack Query가 해시할 때
 *   조각이 사라져 **로그인 사용자의 키와 겹칠 수 있다.** 문자열로 굳혀 그 겹침을 없앤다.
 *
 * ⚠ **`"guest"` 리터럴이 갈리면 캐시 키가 조용히 어긋난다** — 빌드도 린트도 잡지 못하고
 *   화면만 스켈레톤이 되거나 남의 데이터가 남는다. `pollKeys`·`surveyKeys`·`blockKeys` 셋이
 *   같은 조각을 쓰므로(entities끼리는 import할 수 없다) 판정을 이 함수 하나가 소유한다.
 *   `parsePostId`·`safeNextPath`와 같은 이유다.
 *
 * ⚠ **`userId: string`(비로그인이면 아예 조회하지 않는) 키에는 쓰지 않는다** —
 *   `identityKeys`·`profileKeys`가 그 경우라 스코프 조각을 굳힐 이유가 없다.
 */
export function userScope(userId: string | undefined): string {
  return userId ?? "guest";
}
