"use client";

import Link from "next/link";
import type { TransferLeague, TransferSort } from "@/entities/transfer";
import { chipClassName } from "@/shared/ui";
import { boardHref } from "../lib/board-href";
import type { ClubOption } from "../model/use-transfer-board";

/** 레일에 늘어놓는 구단 수 — 그 뒤는 딜이 한두 건인 구단이라 칩으로 둘 가치가 작다. 선택된 구단은 순위와 무관하게 남긴다 */
const MAX_CHIPS = 14;

interface ClubChipsProps {
  /** 보드(리그 필터 안)에 등장하는 구단 — 딜 수 많은 순 */
  options: readonly ClubOption[];
  /** 선택된 구단 코드 — URL이 소유한다(`?club=`). `null`은 전체 */
  club: string | null;
  league: TransferLeague | null;
  sort: TransferSort;
}

/**
 * 구단 필터 칩 레일 — 팬이 이적 소식을 읽는 단위는 리그가 아니라 **구단**이다. 리그 필터는 목록을 5분의 1로밖에 줄이지 못한다.
 *
 * ⚠ **이동이다(`<Link>`)** — 상태를 URL이 소유하므로 정렬 링크와 같은 형태다(`nextjs.md` "필터는 색인 대상인가": 같은 집합의
 *   부분집합이라 색인 대상은 아니고 canonical에서 떨어진다). 선택 표시는 `aria-current="page"`, 형태는 `chipClassName`(잉크, 에메랄드 아님).
 * ⚠ 구단이 하나뿐이면 레일을 그리지 않는다 — 고를 것이 없다.
 * ⚠ `hidden`이 아니라 아예 그리지 않는 것이 맞다 — 칩은 본문이 아니라 도구다.
 */
export function ClubChips({ options, club, league, sort }: ClubChipsProps) {
  if (options.length < 2) return null;
  const shown = options.slice(0, MAX_CHIPS);
  const selected = club === null ? null : options.find((o) => o.code === club);
  if (selected && !shown.includes(selected)) shown.push(selected);
  return (
    <nav aria-label="구단 필터" className="no-scrollbar flex gap-1.5 overflow-x-auto px-5 pb-2.5">
      <Link
        href={boardHref(league, sort, null)}
        aria-current={club === null ? "page" : undefined}
        className={chipClassName(club === null, "inline-flex items-center whitespace-nowrap")}
      >
        전체 구단
      </Link>
      {shown.map((o) => (
        <Link
          key={o.code}
          href={boardHref(league, sort, o.code)}
          aria-current={club === o.code ? "page" : undefined}
          className={chipClassName(club === o.code, "inline-flex items-center gap-1 whitespace-nowrap")}
        >
          {o.label}
          <span className="font-mono text-[10px] tabular-nums opacity-60">{o.count}</span>
        </Link>
      ))}
    </nav>
  );
}
