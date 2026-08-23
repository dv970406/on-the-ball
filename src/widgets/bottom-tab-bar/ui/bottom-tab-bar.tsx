"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, MessagesSquare, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import { ROUTES, activeTabHref } from "@/shared/config";
import { Icon } from "@/shared/ui";

interface TabItem {
  label: string;
  icon: LucideIcon;
  href: string;
}

/**
 * **대상 화면이 있는 탭만 둔다.** 프로토타입에는 홈·밸런스·TMI 자리가 더 있었지만
 * 눌러도 아무 일도 일어나지 않는 자리표시였다 — 동작을 발명하지 않고 걷어냈다.
 * 탭을 되살리려면 라우트를 **먼저** 만든다(빈 자리를 되넣지 말 것).
 */
const TABS: TabItem[] = [
  { label: "커뮤니티", icon: MessagesSquare, href: ROUTES.postList },
  { label: "서베이", icon: ClipboardList, href: ROUTES.surveyList },
  { label: "프로필", icon: User, href: ROUTES.profile },
];

/**
 * 하단 탭바 — 좌우 12px 띄운 다크 알약 (프로토타입 `.otb-tabbar`).
 *
 * ⚠ backdrop-blur를 쓰는 **유일하게 허용된 요소**다. 헤더·모달 스크림에는 쓰지 않는다.
 * ⚠ 활성 탭은 흰 글자 + 흰 반투명 배경이고 **아이콘만 에메랄드**다.
 *   목록 화면의 컬러 이벤트를 0개로 세는 기준에서 탭바는 앱 크롬이라 별도로 취급한다
 *   (프로토타입도 목록에 탭바를 두면서 "목록 = 컬러 이벤트 없음"이라고 적었다).
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

  return (
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
            className={className}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
