"use client";

import Link from "next/link";
import type { TransferLeague, TransferSort } from "@/entities/transfer";
import { cn } from "@/shared/lib";
import { boardHref } from "../lib/board-href";

/** 정렬 링크의 순서 — `as const satisfies`가 없는 값을, 아래 가드가 빠뜨린 값을 막는다 */
const SORTS = ["latest", "fee"] as const satisfies readonly TransferSort[];
const _SORTS_EXHAUSTIVE: Exclude<TransferSort, (typeof SORTS)[number]> extends never ? true : never =
  true;

/** 정렬 라벨 — `확률`은 보류라 없다 */
const SORT_LABEL: Record<TransferSort, string> = { latest: "최신", fee: "이적료" };

interface SortLinksProps {
  league: TransferLeague | null;
  sort: TransferSort;
  /** 구단 필터 — 정렬 링크가 이 값을 유지한다(정렬을 바꿨는데 구단이 풀리면 안 된다) */
  club: string | null;
}

/**
 * 정렬 링크 — 구간 탭 스트립(`GroupTabs`)의 오른쪽 끝에 놓인다.
 *
 * ⚠ **`<Link>`다** — 같은 집합의 순서만 다른 중복이라 색인 대상은 아니지만, 상태를 URL이 소유하므로 이동이다.
 *   선택 표시는 `aria-current="page"`(링크의 상태 표현)이고, 리그·구단 파라미터는 `boardHref`가 유지한다.
 * ⚠ 자리가 규약이다 — 한때 두 칩 줄 사이에 끼어 있어 컨트롤로 보이지 않았다. 필터 레일은 가로 스크롤이라
 *   오른쪽 고정이 안 되고, 헤더 부제 줄은 마감 카운트다운이 쓰는 기간이 있어 탭 스트립 끝이 남는 자리다.
 */
export function SortLinks({ league, sort, club }: SortLinksProps) {
  return (
    <nav aria-label="정렬" className="flex items-center gap-3">
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
  );
}
