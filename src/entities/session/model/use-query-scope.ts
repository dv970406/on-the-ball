"use client";

import { useSessionStore } from "./session-store";

/**
 * 사용자로 스코프된 쿼리의 키에 쓸 사용자 — 세션 복원 전에는 **서버가 알려준 사용자**, 복원 뒤에는 스토어의 값이다.
 * 키가 갈리면 서버가 채운 캐시에 닿지 못해 SSR한 화면이 스켈레톤으로 덮인다 — 빌드도 린트도 잡지 못한다(`nextjs.md`).
 * `ownsPrefetch`: 서버가 본 사용자와 지금 사용자가 같은가 — 다르면 개인화가 섞인 서버 데이터를 그 키에 넣지 않는다.
 */
export function useQueryScope(initialUserId: string | undefined) {
  const status = useSessionStore((s) => s.status);
  const storeUserId = useSessionStore((s) => s.user?.id);
  const userId = status === "loading" ? initialUserId : storeUserId;
  return { status, userId, ownsPrefetch: userId === initialUserId };
}
