/**
 * 연결된 로그인 수단(auth.identities) 쿼리 키.
 *
 * ⚠ **userId로 스코프한다.** `AuthProvider`는 유저가 바뀔 때 활성 쿼리를 지우지 않고
 *   무효화만 하므로, 키가 유저를 포함하지 않으면 `/profile`이 열린 채 계정이 바뀌었을 때
 *   리페치가 끝날 때까지 **이전 사용자의 연결 목록이 그대로 보인다.**
 *   `profileKeys.detail(userId)`와 같은 이유·같은 형태다.
 */
export const identityKeys = {
  all: ["identity"] as const,
  detail: (userId: string) => [...identityKeys.all, userId] as const,
} as const;
