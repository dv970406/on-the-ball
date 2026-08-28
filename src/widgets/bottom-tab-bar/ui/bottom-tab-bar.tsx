"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, MessagesSquare, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import { ROUTES, activeTabHref } from "@/shared/config";
import { Icon, SignInDialog } from "@/shared/ui";
import { useSessionStore } from "@/entities/session";

interface TabItem {
  label: string;
  icon: LucideIcon;
  href: string;
  /**
   * 로그인해야 열리는 탭이면 **무엇이 막혔는지**를 담는다(비로그인이 누르면 안내가 뜬다).
   * ⚠ 문구를 탭이 갖는 이유는 안내가 "프로필을 보려면"까지 말해야 안내이기 때문이다.
   */
  signInAction?: string;
}

/**
 * **대상 화면이 있는 탭만 둔다.** 프로토타입에는 홈·밸런스·TMI 자리가 더 있었지만
 * 눌러도 아무 일도 일어나지 않는 자리표시였다 — 동작을 발명하지 않고 걷어냈다.
 * 탭을 되살리려면 라우트를 **먼저** 만든다(빈 자리를 되넣지 말 것).
 */
const TABS: TabItem[] = [
  { label: "커뮤니티", icon: MessagesSquare, href: ROUTES.postList },
  { label: "입축구", icon: ClipboardList, href: ROUTES.surveyList },
  { label: "프로필", icon: User, href: ROUTES.profile, signInAction: "프로필을 보려면" },
];

/**
 * 하단 탭바 — 좌우 12px 띄운 다크 알약 (프로토타입 `.otb-tabbar`).
 *
 * ⚠ backdrop-blur를 쓰는 **유일하게 허용된 요소**다. 헤더·모달 스크림에는 쓰지 않는다.
 * ⚠ 활성 탭은 흰 글자 + 흰 반투명 배경이고 **아이콘만 에메랄드**다.
 *   이 자리가 허용되는 근거는 원칙이 아니라 `styling.md`의 **에메랄드 자리 표**다 —
 *   같은 `aria-current="page"` 링크인 말머리 칩은 잉크인데, 그 차이를 문장으로는 그을 수 없다.
 */
export function BottomTabBar() {
  /**
   * ⚠ 활성 탭은 **현재 경로로 판정한다.** 전에는 호출부가 `active="프로필"`처럼 라벨 문자열을
   *   넘겼는데, 라벨을 고치면 활성 탭이 0개가 되면서 `aria-current`까지 조용히 사라졌다
   *   (타입이 `string`이라 컴파일도 통과했다).
   */
  const pathname = usePathname();
  // ⚠ 정확 일치로 두면 말머리 목록에서 커뮤니티 탭이 비활성이 된다 — 판정은 routes.ts가 갖는다
  const active = activeTabHref(pathname);

  /**
   * 로그인이 필요한 탭을 비로그인이 눌렀다 — 로그인 화면으로 바로 던지지 않고 안내를 낀다.
   *
   * ⚠ **앵커는 그대로 두고 이동만 가로챈다.** 크롤러가 그 URL을 발견하는 경로가 이 링크이고
   *   (`robots.txt`가 아무것도 막지 않는 근거다 — nextjs.md), 크롤러에게는 proxy가 307을 준다.
   * ⚠ `loading`에는 가로채지 않는다 — 복원 중인 로그인 사용자가 안내를 보면 안 되고,
   *   그대로 보내도 proxy가 쿠키로 옳게 판정한다(액션 컴포넌트들과 같은 3분기).
   */
  const sessionStatus = useSessionStore((s) => s.status);
  const [askSignIn, setAskSignIn] = useState<TabItem | null>(null);

  return (
    <>
      <nav
        aria-label="주요 메뉴"
        className={cn(
          "absolute inset-x-3 bottom-[max(18px,env(safe-area-inset-bottom))] z-70",
          "flex items-center justify-between rounded-[28px] bg-ink/92 p-2",
          // backdrop-blur/saturate 유틸은 Tailwind가 -webkit-backdrop-filter를 함께 출력한다
          // (빌드 CSS에서 확인) — styling.md의 "벤더 prefix 수동 병기"는 clip-path처럼
          // 유틸이 없어 arbitrary로 쓰는 속성에 해당하고, 여기서는 병기가 중복이다.
          "backdrop-blur-[20px] backdrop-saturate-[160%]",
          "shadow-[0_12px_32px_rgba(0,0,0,0.18),inset_0_0_0_1px_rgba(255,255,255,0.06)]",
        )}
      >
        {TABS.map((tab) => {
          const isActive = active === tab.href;
          // 아이콘 20px + 라벨 10px, 높이 56px — 44px 최소 히트 영역을 넉넉히 넘는다
          const content = (
            <>
              <span className={cn("flex items-center justify-center", isActive && "text-primary")}>
                <Icon as={tab.icon} size={20} />
              </span>
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </>
          );
          const className = cn(
            "flex h-14 flex-1 flex-col items-center justify-center gap-[3px] rounded-[22px]",
            "transition-colors duration-150 ease-otb",
            isActive ? "bg-white/[0.08] text-white" : "text-white/55",
          );

          return (
            <Link
              key={tab.label}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              // ⚠ 수식어 클릭은 가로채지 않는다 — 사유는 `post-list-view`의 FAB 주석과 같다
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                if (!tab.signInAction || sessionStatus !== "guest") return;
                e.preventDefault();
                setAskSignIn(tab);
              }}
              aria-haspopup={
                tab.signInAction && sessionStatus === "guest" ? "dialog" : undefined
              }
              className={className}
            >
              {content}
            </Link>
          );
        })}
      </nav>

      {/*
        ⚠ `<nav>`의 **형제**여야 한다. 탭바가 `absolute`라 자기 안의 `Dialog`에게
          컨테이닝 블록이 되어, 안에 두면 72px짜리 알약 한가운데에 뜬다.
        ⚠ 목적지를 그 탭으로 준다 — 지금 화면으로 되돌리면 로그인하고 와서 다시 눌러야 한다.
      */}
      <SignInDialog
        open={askSignIn !== null}
        onClose={() => setAskSignIn(null)}
        action={askSignIn?.signInAction ?? ""}
        next={askSignIn?.href}
      />
    </>
  );
}
