"use client";

import { SignInLink } from "@/shared/ui";
import { useSessionStore } from "@/entities/session";

/**
 * 목록 화면 상단의 세션 표시 — **비로그인일 때 로그인 링크만** 그린다.
 * status가 확정되기 전에는 아무것도 그리지 않는다(비로그인 UI가 잠깐 보이는 깜빡임 방지).
 *
 * ⚠ 로그인 상태에서는 아무것도 그리지 않는다. 닉네임·로그아웃을 여기 두면 계정 관련 동작이
 *   목록 헤더와 프로필 화면 두 곳으로 갈리는데, 프로필로 가는 진입점은 늘 따로 있다(1024px 미만은
 *   하단 탭바, 그 이상은 데스크톱 상단 바) → 계정은 프로필 화면이 단독으로 갖는다(로그아웃도 거기 있다).
 * ⚠ 로그인 후 보던 화면(쿼리 포함)으로 돌아오는 목적지는 `SignInLink`가 싣는다 — 라벨이 "로그인"이라
 *   `SignInDialog`를 끼지 않고 곧바로 이동한다(목적지가 라벨에 이미 적혀 있다).
 */
export function AuthStatus() {
  const status = useSessionStore((s) => s.status);

  if (status !== "guest") return null;

  return <SignInLink />;
}
