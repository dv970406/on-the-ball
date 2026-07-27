"use client";

import type { ReactNode } from "react";
import { Bell, Search } from "lucide-react";
import { Icon, Wordmark } from "@/shared/ui";
import { useMyProfileQuery } from "@/entities/user";

/** 퀴즈 연속 정답 스트릭 칩 — 다크 pill + 에메랄드 불꽃 닷 */
function StreakChip() {
  const { data: profile } = useMyProfileQuery();
  const days = profile?.currentStreak ?? 0;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas-night py-1 pl-1.5 pr-2.5 text-[11px] font-medium text-white">
      <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px]">
        🔥
      </span>
      {days}일 연속
    </span>
  );
}

function IconButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-full border border-hairline-cool bg-canvas-soft text-ink"
    >
      {children}
    </button>
  );
}

interface AppBarProps {
  left?: ReactNode;
  right?: ReactNode;
}

/** 상단 앱바 (sticky) — 기본: 워드마크 + 스트릭 칩 + 검색/알림 */
export function AppBar({ left, right }: AppBarProps) {
  return (
    <header className="sticky top-0 z-[5] flex items-center border-b border-hairline-cool bg-canvas px-5 pb-3 pt-[max(20px,env(safe-area-inset-top))]">
      {left ?? <Wordmark />}
      {/* right 주입 시엔 임의 노드가 오므로 ul(자식이 li여야 함)을 쓰지 않는다 */}
      {right ? (
        <div className="ml-auto flex items-center gap-2.5">{right}</div>
      ) : (
        <ul className="ml-auto flex items-center gap-2.5">
          {/* li에 flex — inline-flex인 StreakChip이 블록 자식이 되면 baseline 여백이 생긴다 */}
          <li className="flex">
            <StreakChip />
          </li>
          <li className="flex">
            <IconButton label="검색">
              <Icon as={Search} size={16} />
            </IconButton>
          </li>
          <li className="flex">
            <IconButton label="알림">
              <Icon as={Bell} size={16} />
            </IconButton>
          </li>
        </ul>
      )}
    </header>
  );
}
