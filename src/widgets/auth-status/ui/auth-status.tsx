"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES, signInWithNext } from "@/shared/config";
import { Skeleton, buttonClassName } from "@/shared/ui";
import { useSessionStore } from "@/entities/session";
import { useProfileQuery } from "@/entities/profile";
import { useSignOut } from "@/features/sign-out";

/**
 * 목록 화면 상단의 세션 표시 — 로그인 링크 / 닉네임 + 로그아웃.
 * status가 확정되기 전에는 아무것도 그리지 않는다(비로그인 UI가 잠깐 보이는 깜빡임 방지).
 *
 * ⚠ 이메일이 아니라 **닉네임**을 보여준다 — 같은 화면의 글쓴이 표기가 전부 닉네임인데
 *   내 정보만 이메일이면 표기 체계가 두 갈래가 되고, 이메일은 목록 상단에 상시 노출될 값이 아니다.
 */
export function AuthStatus() {
  const status = useSessionStore((s) => s.status);
  const user = useSessionStore((s) => s.user);
  const pathname = usePathname();
  const signOut = useSignOut();
  // 세션을 아는 이 레이어가 userId를 넘긴다 (entities끼리는 서로 import할 수 없다)
  const { data: profile, isPending: profilePending } = useProfileQuery(user?.id);

  if (status === "loading") return null;

  if (status === "guest") {
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

  return (
    <div className="flex items-center gap-2">
      {/*
        ⚠ 빈 문자열을 두면 폭이 0이라 자리를 못 잡고, 닉네임이 도착하는 순간
        로그아웃 버튼이 밀린다(이메일은 세션에 이미 있어 왕복이 없었지만 닉네임은 조회가 필요하다).
        스켈레톤으로 자리를 확보한다.
      */}
      {profilePending ? (
        <Skeleton className="h-4 w-16" />
      ) : (
        /*
          프로필 화면의 유일한 진입점이다 — 하단 탭바의 "내 활동"에는 아직 라우트가 없다.
          ⚠ 닉네임이 비면 **라벨 없는 링크**가 된다(조회 실패 시 isPending=false·data=undefined).
            접근 가능한 이름도 없고 클릭 영역도 0이라 프로필로 들어갈 방법이 사라진다
            → 조회가 실패해도 진입은 살려 둔다.
        */
        <Link
          href={ROUTES.profile}
          className="max-w-[140px] truncate text-[13px] text-ink-mute underline decoration-hairline-strong underline-offset-[3px]"
        >
          {profile?.nickname ?? "내 프로필"}
        </Link>
      )}
      <button
        type="button"
        onClick={() => signOut.mutate()}
        disabled={signOut.isPending}
        className="text-[13px] text-ink-mute underline underline-offset-2 disabled:opacity-40"
      >
        로그아웃
      </button>
    </div>
  );
}
