/**
 * 프로필 쿼리 키.
 *
 * ⚠ **반드시 userId로 스코프한다.** `useSessionSync`는 유저가 바뀔 때 비활성 캐시만 지우고
 *   활성 쿼리는 무효화만 하므로(리페치가 끝날 때까지 옛 데이터가 남는다), 키가 유저를
 *   포함하지 않으면 계정 전환 직후 **이전 사용자의 프로필이 한 프레임 노출된다.**
 *   키에 userId가 있으면 그 사고가 구조적으로 불가능하다.
 *
 * ⚠ `"use client"`가 없다 — 서버(generateMetadata·서버 컴포넌트)도 이 키를 쓸 수 있어야 한다.
 *   `post`·`comment`의 `api/keys.ts`와 같은 형태다.
 */
export const profileKeys = {
  all: ["profile"] as const,
  detail: (userId: string) => [...profileKeys.all, userId] as const,
} as const;
