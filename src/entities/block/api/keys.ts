/**
 * 차단 쿼리 키.
 *
 * ⚠ **userId로 스코프한다.** 차단 목록은 통째로 "나"에 종속된 값이라, 키에 유저가 없으면
 *   `/profile`을 연 채 계정이 바뀌었을 때 **이전 사용자의 차단 목록이 노출된다**
 *   (`useSessionSync`는 활성 쿼리를 지우지 않고 무효화만 하므로 리페치가 끝날 때까지
 *   옛 데이터가 남는다). `identityKeys`·`pollKeys`·`profileKeys.detail`과 같은 이유·같은 형태다.
 *
 * ⚠ 비로그인은 `userId`가 `undefined`다 — 문자열로 굳혀 로그인 사용자의 키와 겹치지 않게 한다.
 */
const scope = (userId: string | undefined) => userId ?? "guest";

export const blockKeys = {
  all: ["block"] as const,
  list: (userId: string | undefined) => [...blockKeys.all, "list", scope(userId)] as const,
} as const;
