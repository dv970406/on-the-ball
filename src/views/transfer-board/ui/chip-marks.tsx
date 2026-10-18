import { Heart, X } from "lucide-react";
import type { TransferLeague, TransferSort } from "@/entities/transfer";
import { cn } from "@/shared/lib";
import { chipClassName, Icon } from "@/shared/ui";
import { boardHref } from "../lib/board-href";
import type { ClubOption } from "../model/use-transfer-board";
import { BoardLink } from "./board-link";

/**
 * 보드 필터 칩과 그 안의 표지 — 모바일 칩 줄(`FilterRail`)과 넓은 화면 왼쪽 레일(`BoardRail`)이 같은 모양·같은 낭독을 쓴다.
 * 아이콘은 모양만 지고 뜻은 `sr-only` 글자가 진다(`code-quality.md` ARIA 절 — 링크 이름에 덧붙어 읽힌다).
 */

/**
 * 켜진 필터의 X — 누르면 그 필터가 풀린다는 표시.
 * 칩 안에서는 12px에 오른쪽 여백을 반 칸 당기고(칩 패딩과 시각 균형), 글자 링크("관심만 보기") 안에서는 `compact`로 11px만 둔다.
 */
export function ClearFilterMark({ compact = false }: { compact?: boolean }) {
  return (
    <>
      {compact ? <Icon as={X} size={11} /> : <Icon as={X} size={12} className="-mr-0.5" />}
      <span className="sr-only">필터 해제</span>
    </>
  );
}

/** 응원 구단 칩의 하트 — 응원 구단이 칩 줄 맨 앞에 놓이는 이유를 보여 준다 */
function FollowedClubMark() {
  return (
    <>
      <Icon as={Heart} size={11} className="fill-current" />
      <span className="sr-only">응원 구단</span>
    </>
  );
}

interface ClubChipProps {
  option: ClubOption;
  /** 지금 걸린 구단 필터(`?club=`) — 이 칩의 구단이면 켜진 칩이고, 누르면 풀린다 */
  club: string | null;
  league: TransferLeague | null;
  sort: TransferSort;
  watch: boolean;
  /** 칩 크기 — 줄마다 다르다(칩 줄은 기본 칩, 레일은 작은 칩) */
  className?: string;
  /** 구단 이름 뒤에 딜 수를 붙인다(레일) */
  showCount?: boolean;
}

/** 구단 필터 칩 하나 — 누르면 그 구단으로 거르고, 켜진 칩을 다시 누르면 푼다. 다른 필터(리그·정렬·관심)는 그대로 싣는다 */
export function ClubChip({ option, club, league, sort, watch, className, showCount = false }: ClubChipProps) {
  const on = club === option.code;
  return (
    <BoardLink
      href={boardHref(league, sort, on ? null : option.code, watch)}
      aria-current={on ? "page" : undefined}
      className={chipClassName(on, cn("inline-flex items-center gap-1 whitespace-nowrap", className))}
    >
      {option.followed && <FollowedClubMark />}
      {option.label}
      {showCount && (
        <span className={cn("font-mono text-[11px] tabular-nums", on ? "text-ink-faint" : "text-ink-mute-2")}>
          {option.count}
        </span>
      )}
      {on && <ClearFilterMark />}
    </BoardLink>
  );
}
