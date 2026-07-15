"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame, Home, Puzzle, SquareSplitVertical, User } from "lucide-react";
import { cn } from "@/shared/lib";
import { ROUTES } from "@/shared/config";
import { Icon } from "@/shared/ui";

const NAV_ITEMS = [
  { href: ROUTES.home, label: "홈", icon: Home },
  { href: ROUTES.balanceList, label: "밸런스", icon: SquareSplitVertical },
  { href: ROUTES.quizList, label: "퀴즈", icon: Puzzle },
  { href: ROUTES.tmi, label: "TMI", icon: Flame },
  { href: ROUTES.me, label: "내 활동", icon: User },
] as const;

/**
 * 하단 플로팅 탭바 — 다크(rgba 0.92)+blur, radius 28px, 좌우 12px 플로팅.
 * 배경 blur는 디자인 규칙상 탭바에만 허용된 예외.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="absolute inset-x-3 bottom-[max(18px,env(safe-area-inset-bottom))] z-[70] flex items-center justify-between rounded-[28px] bg-[rgba(23,23,23,0.92)] p-2 shadow-[0_12px_32px_rgba(0,0,0,0.18),inset_0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-[20px] backdrop-saturate-[1.6]"
      aria-label="주요 메뉴"
    >
      {NAV_ITEMS.map(({ href, label, icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-14 flex-1 flex-col items-center justify-center gap-[3px] rounded-[22px] text-[10px] font-medium transition-colors duration-150 ease-otb",
              active ? "bg-white/[0.08] text-white" : "text-white/55",
            )}
          >
            <span className={cn("flex items-center justify-center", active && "text-primary")}>
              <Icon as={icon} size={20} />
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
