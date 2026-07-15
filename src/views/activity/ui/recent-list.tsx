"use client";

import { useRouter } from "next/navigation";
import {
  CircleCheck,
  CircleX,
  Flame,
  ListOrdered,
  Puzzle,
  Shirt,
  SquareSplitVertical,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { Button, EmptyState, Icon } from "@/shared/ui";
import { formatPct } from "@/shared/lib";
import { ROUTES } from "@/shared/config";
import type { ActivityRecent } from "../model/use-my-activity";

/** 콘텐츠 타입별 아이콘 */
const KIND_ICON: Record<ActivityRecent["kind"], LucideIcon> = {
  balance: SquareSplitVertical,
  ranking: ListOrdered,
  kit: Shirt,
  tmi: Flame,
  quiz: Puzzle,
};

/** 최근 한 표 리스트 — 폴은 동의율, 퀴즈는 정오답 표시 */
export function RecentList({ items }: { items: ActivityRecent[] }) {
  const router = useRouter();

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Vote}
        title="아직 활동이 없어요"
        description="첫 한 표를 던져보세요"
        action={
          <Button variant="dark" size="sm" onClick={() => router.push(ROUTES.home)}>
            홈에서 시작하기
          </Button>
        }
      />
    );
  }

  return (
    <ul className="border-t border-hairline-cool">
      {items.map((item, i) => (
        <li
          key={`${item.kind}-${item.when}-${i}`}
          className="flex items-center gap-3 border-b border-hairline-cool px-5 py-3.5"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-hairline-cool bg-canvas-soft text-ink">
            <Icon as={KIND_ICON[item.kind]} size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium leading-snug text-ink">{item.title}</p>
            <p className="mt-1 text-[11px] text-ink-mute">
              내 선택: <span className="font-medium text-ink">{item.pick}</span>
            </p>
          </div>
          {item.kind === "quiz" ? (
            <span
              className={`flex shrink-0 items-center gap-1 text-[11px] ${
                item.isCorrect ? "text-primary-deep" : "text-crimson"
              }`}
            >
              <Icon as={item.isCorrect ? CircleCheck : CircleX} size={16} aria-hidden />
              {item.isCorrect ? "정답" : "오답"}
            </span>
          ) : (
            <span className="shrink-0 font-mono text-xs text-ink-mute tnum">
              동의 {formatPct(item.agreeRatio ?? 0)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
