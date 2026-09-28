"use client";

import { ChevronDown, X } from "lucide-react";
import Link from "next/link";
import type { TransferLeague, TransferSort } from "@/entities/transfer";
import { chipClassName, Icon } from "@/shared/ui";
import { boardHref } from "../lib/board-href";
import { leagueLabel } from "../lib/league-options";
import type { ClubOption } from "../model/use-transfer-board";

/** 레일에 늘어놓는 구단 수 — 그 뒤는 딜이 한두 건인 구단이라 칩으로 둘 가치가 작다. 선택된 구단은 순위와 무관하게 남긴다 */
const MAX_CHIPS = 14;

interface FilterRailProps {
  /** 보드(리그 필터 안)에 등장하는 구단 — 딜 수 많은 순 */
  options: readonly ClubOption[];
  /** 선택된 구단 코드 — URL이 소유한다(`?club=`). `null`은 전체 */
  club: string | null;
  league: TransferLeague | null;
  sort: TransferSort;
  onOpenLeague: () => void;
}

/**
 * 필터 레일 — 왼쪽에 리그 버튼(시트를 연다)을 고정하고 그 뒤로 구단 칩이 흐른다. 보드의 **필터는 이 한 줄이 전부**다
 * (구간 탭은 이동, 정렬은 순서 — 둘 다 필터가 아니라 다른 줄·다른 형태다).
 *
 * 팬이 이적 소식을 읽는 단위는 리그가 아니라 **구단**이다 — 리그 필터는 목록을 5분의 1로밖에 줄이지 못한다. 리그는
 * 구단 칩의 범위를 고르는 상위 선택으로 남는다(리그를 바꾸면 구단 필터는 풀린다 — 뷰의 `handleLeagueSelect`).
 *
 * ⚠ **구단 칩은 이동이다(`<Link>`)** — 상태를 URL이 소유하므로 정렬 링크와 같은 형태다(`nextjs.md` "필터는 색인
 *   대상인가": 같은 집합의 부분집합이라 색인 대상은 아니고 canonical에서 떨어진다). 선택 표시는 `aria-current="page"`,
 *   형태는 `chipClassName`(잉크, 에메랄드 아님).
 * ⚠ **`전체 구단` 칩이 없다.** 필터 없음이 기본 상태라 그 칩은 늘 켜져 있는 장식이었다 → 선택된 칩에 ×를 붙이고 그 칩의
 *   링크가 필터를 푼다(`href`가 구단 `null`). 칩 하나가 줄고 "무엇이 걸려 있는가"가 또렷해진다.
 * ⚠ **칩에 건수를 적지 않는다.** 순서가 이미 건수순이고, 누르면 구간 제목이 건수를 말한다 — 한 화면에 숫자 20개가
 *   붙어 있던 것이 정신없어 보인 원인 중 하나였다.
 * ⚠ 리그 버튼은 그냥 `button`이다 — `aria-haspopup`을 붙이지 않는다(과한 ARIA는 없느니만 못하다).
 * ⚠ 고를 구단이 둘 미만이면 칩을 그리지 않는다(리그 버튼만 남는다). 단 선택된 구단이 있으면 풀 길이 있어야 하므로 그린다.
 * ⚠ 칩 레일은 화면 오른쪽 끝까지 흐른다(`-mr-5 pr-5`) — 오른쪽에 여백이 남으면 거기서 끝나는 것처럼 보인다.
 */
export function FilterRail({ options, club, league, sort, onOpenLeague }: FilterRailProps) {
  const shown = options.slice(0, MAX_CHIPS);
  const selected = club === null ? null : options.find((o) => o.code === club);
  if (selected && !shown.includes(selected)) shown.push(selected);
  const showChips = options.length >= 2 || selected !== null;

  return (
    <div className="flex items-center gap-2 px-5 pb-2.5 pt-3">
      <button
        type="button"
        onClick={onOpenLeague}
        className="inline-flex h-[33px] flex-none items-center gap-1 whitespace-nowrap rounded-sm border border-hairline-strong bg-canvas pl-3 pr-2.5 text-[13px] font-medium text-ink transition-colors duration-150 ease-otb active:bg-canvas-soft"
      >
        {leagueLabel(league)}
        <Icon as={ChevronDown} size={14} />
      </button>

      {showChips && (
        <>
          {/* 고정된 리그 버튼과 흐르는 구단 칩의 경계 — 헤어라인 한 토막 */}
          <span aria-hidden className="h-5 w-px flex-none bg-hairline" />
          <nav aria-label="구단 필터" className="no-scrollbar -mr-5 flex min-w-0 gap-1.5 overflow-x-auto pr-5">
            {shown.map((o) => {
              const isSelected = club === o.code;
              return (
                <Link
                  key={o.code}
                  href={boardHref(league, sort, isSelected ? null : o.code)}
                  aria-current={isSelected ? "page" : undefined}
                  className={chipClassName(isSelected, "inline-flex items-center gap-1 whitespace-nowrap")}
                >
                  {o.label}
                  {isSelected && (
                    <>
                      <Icon as={X} size={12} className="-mr-0.5" />
                      <span className="sr-only">필터 해제</span>
                    </>
                  )}
                </Link>
              );
            })}
          </nav>
        </>
      )}
    </div>
  );
}
