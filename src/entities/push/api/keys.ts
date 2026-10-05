/**
 * 알림 쿼리 키.
 *
 * ⚠ **userId로 스코프한다.** 상태가 "이 기기의 구독이 **내 것**인가"라 사용자에 종속된다 — 같은 브라우저에서
 *   계정을 바꾸면 앞 사람의 `on`이 남으면 안 된다(`profileKeys`와 같은 이유).
 */
export const pushKeys = {
  all: ["push"] as const,
  status: (userId: string) => [...pushKeys.all, "status", userId] as const,
} as const;
