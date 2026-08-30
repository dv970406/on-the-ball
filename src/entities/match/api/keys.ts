import { userScope } from "@/shared/lib/query-scope";

/**
 * 승부예측 쿼리 키.
 *
 * ⚠ **목록까지 userId로 스코프한다.** 카드가 "내가 고른 값"을 표시하려고 `match_prediction`
 *   임베딩을 쓰므로 목록 응답 자체가 "나"에 종속된다 — 키에 유저가 없으면 목록을 연 채
 *   계정이 바뀌었을 때 **이전 사용자의 예측이 그대로 남는다**(`useSessionSync`는 활성 쿼리를
 *   지우지 않고 무효화만 한다). `surveyKeys`·`pollKeys`·`blockKeys`와 같은 이유·같은 형태다.
 *
 * ⚠ 집계(`results`)는 "나"에 종속되지 않지만(킥오프가 지나면 모두에게 같다) **같은 스코프를
 *   쓴다** — 스코프가 갈리면 로그인 전후로 키가 어긋나 같은 집계를 두 번 받는다.
 */
export const matchKeys = {
  all: ["match"] as const,
  lists: () => [...matchKeys.all, "list"] as const,
  list: (userId: string | undefined) => [...matchKeys.lists(), userScope(userId)] as const,
  details: () => [...matchKeys.all, "detail"] as const,
  detail: (id: number, userId: string | undefined) =>
    [...matchKeys.details(), id, userScope(userId)] as const,
  results: (id: number, userId: string | undefined) =>
    [...matchKeys.all, "results", id, userScope(userId)] as const,
  /**
   * ⚠ **`userScope`를 쓴다.** 이 키는 비로그인일 때도 **조립되기 때문**이다(조회만 `enabled`로
   *   꺼진다) — `identityKeys`·`profileKeys`처럼 인자가 `string`이라 아예 만들어지지 않는
   *   키와 갈리는 지점이다. 호출부가 `?? ""` 같은 리터럴을 각자 적으면 그 순간 키가 갈린다.
   */
  accuracy: (userId: string | undefined) =>
    [...matchKeys.all, "accuracy", userScope(userId)] as const,
} as const;
