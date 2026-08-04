import Link from "next/link";
import { Flame, Home, MessagesSquare, SplitSquareVertical, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import { ROUTES } from "@/shared/config";
import { Icon } from "@/shared/ui";

interface TabItem {
  label: string;
  icon: LucideIcon;
  /** 라우트가 있는 탭만 이동한다. 없으면 자리만 지킨다 */
  href?: string;
}

/**
 * 기존 앱 공용 탭 5개. **커뮤니티만 라우트가 있다.**
 * 나머지 4개는 프로토타입에 자리가 잡혀 있을 뿐 대상 화면이 없다 —
 * 동작을 발명하지 않고(핸드오프 0장) aria-disabled로 남긴다.
 */
const TABS: TabItem[] = [
  { label: "홈", icon: Home },
  { label: "밸런스", icon: SplitSquareVertical },
  { label: "커뮤니티", icon: MessagesSquare, href: ROUTES.postList },
  { label: "TMI", icon: Flame },
  { label: "내 활동", icon: User },
];

/**
 * 하단 탭바 — 좌우 12px 띄운 다크 알약 (프로토타입 `.otb-tabbar`).
 *
 * ⚠ backdrop-blur를 쓰는 **유일하게 허용된 요소**다. 헤더·모달 스크림에는 쓰지 않는다.
 * ⚠ 활성 탭은 흰 글자 + 흰 반투명 배경이고 **아이콘만 에메랄드**다.
 *   목록 화면의 컬러 이벤트를 0개로 세는 기준에서 탭바는 앱 크롬이라 별도로 취급한다
 *   (프로토타입도 목록에 탭바를 두면서 "목록 = 컬러 이벤트 없음"이라고 적었다).
 */
export function BottomTabBar({ active = "커뮤니티" }: { active?: string }) {
  return (
    <nav
      aria-label="주요 메뉴"
      className={cn(
        "absolute inset-x-3 bottom-[max(18px,env(safe-area-inset-bottom))] z-70",
        "flex items-center justify-between rounded-[28px] bg-ink/92 p-2",
        "backdrop-blur-[20px] backdrop-saturate-[160%]",
        "shadow-[0_12px_32px_rgba(0,0,0,0.18),inset_0_0_0_1px_rgba(255,255,255,0.06)]",
      )}
    >
      {TABS.map((tab) => {
        const isActive = tab.label === active;
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

        return tab.href ? (
          <Link
            key={tab.label}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={className}
          >
            {content}
          </Link>
        ) : (
          <span key={tab.label} aria-disabled className={cn(className, "opacity-60")}>
            {content}
          </span>
        );
      })}
    </nav>
  );
}
