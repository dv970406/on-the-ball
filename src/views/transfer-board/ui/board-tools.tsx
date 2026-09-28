"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { TransferLeague, TransferSort } from "@/entities/transfer";
import { cn } from "@/shared/lib";
import { Icon } from "@/shared/ui";
import { boardHref } from "../lib/board-href";
import { leagueLabel } from "../lib/league-options";

/** 정렬 링크의 순서 — `as const satisfies`가 없는 값을, 아래 가드가 빠뜨린 값을 막는다 */
const SORTS = ["latest", "fee"] as const satisfies readonly TransferSort[];
const _SORTS_EXHAUSTIVE: Exclude<TransferSort, (typeof SORTS)[number]> extends never ? true : never =
  true;

/** 카피는 handoff 9장 그대로(`확률`은 보류 — 계획서 §0) */
const SORT_LABEL: Record<TransferSort, string> = { latest: "최신", fee: "이적료" };

interface BoardToolsProps {
  league: TransferLeague | null;
  sort: TransferSort;
  /** 구단 필터 — 정렬 링크가 이 값을 유지한다(정렬을 바꿨는데 구단이 풀리면 안 된다) */
  club: string | null;
  onOpenLeague: () => void;
}

/**
 * 도구줄(handoff §4-5) — 좌 리그 버튼(시트를 연다) · 우 정렬 링크.
 *
 * ⚠ 정렬은 **`<Link>`**다 — 같은 집합의 순서만 다른 중복이라 색인 대상은 아니지만, 상태를
 *   URL이 소유하므로 이동이다(`PostListView`의 정렬 행과 같은 형태). 선택 표시는
 *   `aria-current="page"`(링크의 상태 표현)이고, 리그·구단 파라미터는 `boardHref`가 유지한다.
 * ⚠ 리그 버튼은 그냥 `button`이다 — `aria-haspopup`을 붙이지 않는다(과한 ARIA는 없느니만 못하다).
 * ⚠ 아래 구분선 없음(handoff).
 */
export function BoardTools({ league, sort, club, onOpenLeague }: BoardToolsProps) {
  return (
    <div className="flex items-center gap-1.5 px-5 pb-2.5 pt-0.5">
      <button
        type="button"
        onClick={onOpenLeague}
        className="inline-flex h-[34px] flex-none items-center gap-1 whitespace-nowrap rounded-sm border border-hairline-strong bg-canvas pl-3 pr-2.5 text-[13px] font-medium text-ink transition-colors duration-150 ease-otb active:bg-canvas-soft"
      >
        {leagueLabel(league)}
        <Icon as={ChevronDown} size={14} />
      </button>

      <nav aria-label="정렬" className="ml-auto flex items-center gap-3.5">
        {SORTS.map((item) => (
          <Link
            key={item}
            href={boardHref(league, item, club)}
            aria-current={sort === item ? "page" : undefined}
            className={cn(
              "py-1.5 text-[12px] transition-colors duration-150 ease-otb",
              sort === item ? "font-medium text-ink" : "text-ink-mute-2",
            )}
          >
            {SORT_LABEL[item]}
          </Link>
        ))}
      </nav>
    </div>
  );
}
