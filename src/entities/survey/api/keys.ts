/**
 * 서베이 쿼리 키.
 *
 * ⚠ **목록까지 userId로 스코프한다.** 상세(`myOptionId`)·결과뿐 아니라 **목록도** "나"에
 *   종속된 값을 담는다 — 카드가 "참여 완료"를 표시하려고 `survey_vote` 임베딩을 쓰기 때문이다.
 *   `useSessionSync`는 유저가 바뀔 때 활성 쿼리를 지우지 않고 무효화만 하므로, 키에 유저가
 *   없으면 목록을 연 채 계정이 바뀌었을 때 **이전 사용자의 참여 표시가 그대로 남는다.**
 *   `pollKeys`·`identityKeys`·`blockKeys`와 같은 이유·같은 형태다.
 *
 * ⚠ 비로그인은 `userId`가 `undefined`다 — 문자열로 굳혀 로그인 사용자의 키와 겹치지 않게 한다.
 */
const scope = (userId: string | undefined) => userId ?? "guest";

export const surveyKeys = {
  all: ["survey"] as const,
  lists: () => [...surveyKeys.all, "list"] as const,
  list: (userId: string | undefined) => [...surveyKeys.lists(), scope(userId)] as const,
  details: () => [...surveyKeys.all, "detail"] as const,
  detail: (id: number, userId: string | undefined) =>
    [...surveyKeys.details(), id, scope(userId)] as const,
  results: (id: number, userId: string | undefined) =>
    [...surveyKeys.all, "results", id, scope(userId)] as const,
} as const;
