import { userScope } from "@/shared/lib/query-scope";

/**
 * 투표 쿼리 키 — 글 단위다(1글 : 1투표라 목록 계층이 없다).
 *
 * `detail`과 `results`를 나눠 두는 이유: 결과는 **투표해야 열리므로** 두 쿼리의 수명이
 * 다르다. 낙관적 업데이트도 둘을 따로 손댄다.
 *
 * ⚠ **userId로 스코프한다.** 두 캐시 모두 "나"에 종속된 값을 담는다 —
 *   `detail`은 `myOptionId`(내가 고른 선택지), `results`는 **내가 투표해야만 열리는** 집계다.
 *   `useSessionSync`는 유저가 바뀔 때 활성 쿼리를 지우지 않고 무효화만 하므로, 키에 유저가
 *   없으면 상세 화면을 연 채 로그아웃했을 때 이전 사용자의 선택과 집계가 그대로 남는다.
 *   특히 결과 쪽은 비로그인 리페치가 42501로 실패해 옛 데이터가 **영구히** 눌러앉는다.
 *   `identityKeys`·`profileKeys.detail(userId)`와 같은 이유·같은 형태다.
 *
 * ⚠ 비로그인은 `userId`가 `undefined`다 — `userScope`가 문자열로 굳혀 로그인 사용자의 키와
 *   겹치지 않게 한다. 셋이 같은 조각을 쓰므로 판정은 그 함수가 단독으로 소유한다.
 */

export const pollKeys = {
  all: ["poll"] as const,
  details: () => [...pollKeys.all, "detail"] as const,
  detail: (postId: number, userId: string | undefined) =>
    [...pollKeys.details(), postId, userScope(userId)] as const,
  results: (postId: number, userId: string | undefined) =>
    [...pollKeys.all, "results", postId, userScope(userId)] as const,
} as const;
