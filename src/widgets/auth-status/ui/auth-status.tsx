"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signInWithNext } from "@/shared/config";
import { buttonClassName } from "@/shared/ui";
import { useSessionStore } from "@/entities/session";

/**
 * 목록 화면 상단의 세션 표시 — **비로그인일 때 로그인 링크만** 그린다.
 * status가 확정되기 전에는 아무것도 그리지 않는다(비로그인 UI가 잠깐 보이는 깜빡임 방지).
 *
 * ⚠ 로그인 상태에서는 아무것도 그리지 않는다. 닉네임·로그아웃을 여기 두면 계정 관련 동작이
 *   목록 헤더와 프로필 화면 두 곳으로 갈리는데, 프로필로 가는 진입점은 하단 탭바가 이미
 *   상시 제공한다 → 계정은 프로필 화면이 단독으로 갖는다(로그아웃도 거기 있다).
 */
export function AuthStatus() {
  const status = useSessionStore((s) => s.status);
  const pathname = usePathname();

  if (status !== "guest") return null;

  return (
    // 로그인 후 보던 화면으로 돌아오도록 목적지를 싣는다 —
    // 앱의 다른 로그인 진입점(좋아요·댓글·가드)이 전부 이 형태다.
    <Link
      href={signInWithNext(pathname)}
      className={buttonClassName({ variant: "secondary", size: "sm" })}
    >
      로그인
    </Link>
  );
}
