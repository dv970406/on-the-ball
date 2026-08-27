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
    // 로그인 후 보던 화면으로 돌아오도록 목적지를 싣는다(`signInWithNext` — 가드·proxy와 같은 형태).
    // ⚠ **여기는 곧바로 이동한다.** 좋아요·투표·차단·신고·글쓰기처럼 라벨이 동작을 말하는
    //   컨트롤은 `SignInDialog`로 한 단계 안내를 끼지만, 라벨이 "로그인"이면 목적지가 이미
    //   적혀 있어 되묻는 것이 방해다(같은 예외가 `CommentBar`의 로그인 버튼).
    <Link
      href={signInWithNext(pathname)}
      className={buttonClassName({ variant: "secondary", size: "sm" })}
    >
      로그인
    </Link>
  );
}
