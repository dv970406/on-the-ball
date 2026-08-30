"use client";

import { useMyAccuracyQuery } from "@/entities/match";
import { useSessionStore } from "@/entities/session";

/**
 * 목록 머리의 "내 적중률".
 *
 * ⚠ **`useMatchList`에서 떼어 냈다.** 목록 데이터와 값을 다투지 않는 **독립 관심사**라
 *   한 훅에 얹으면 반환값이 한도를 넘고 그 훅이 관심사를 둘 들게 된다
 *   (`code-quality.md`: "한 값을 두고 다투는 로직은 쪼개지 않는다"의 반대 경우다).
 *
 * ⚠ **실패해도 화면을 막지 않는다.** 곁다리 지표라 없으면 그 줄만 빠진다 — 본문이 멀쩡한데
 *   곁다리 실패로 전체를 에러 화면으로 갈아치우지 않는다는 규약.
 */
export function useMatchAccuracy(initialUserId?: string) {
  const sessionStatus = useSessionStore((s) => s.status);
  const storeUserId = useSessionStore((s) => s.user?.id);
  const userId = sessionStatus === "loading" ? initialUserId : storeUserId;

  const { data } = useMyAccuracyQuery(userId);

  // 예측한 채점 경기가 없으면 보여줄 것이 없다 — "0전 0중"은 정보가 아니라 소음이고,
  // 신규 사용자에게는 실패처럼 읽힌다.
  // ⚠ 잘림을 **숨기지 말고 알린다** — 비율은 거짓이지만 "왜 사라졌는지"는 말해야 한다
  return {
    accuracy: data && !data.truncated && data.total > 0 ? data : null,
    truncated: data?.truncated ?? false,
  };
}
