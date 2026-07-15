"use client";

import { useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { EmptyState, Skeleton } from "@/shared/ui";
import { cn } from "@/shared/lib";
import { pickSides, usePollsQuery, type PollListItem } from "@/entities/poll";
import { BalanceListCard } from "./balance-list-card";

const ALL_FILTER = "전체";

/** 밸런스 게임 리스트 탭 — 자체 헤더 + 태그 필터 + 리스트 카드 */
export function BalanceListView() {
  const { data: polls, isPending, error } = usePollsQuery("balance");
  const [filter, setFilter] = useState(ALL_FILTER);

  // '전체' + 데이터의 유니크 tag (position asc 순서 유지)
  const filters = useMemo(() => {
    const tags: string[] = [];
    for (const poll of polls ?? []) {
      if (poll.tag && !tags.includes(poll.tag)) tags.push(poll.tag);
    }
    return [ALL_FILTER, ...tags];
  }, [polls]);

  const filtered = useMemo(() => {
    if (!polls) return [];
    return filter === ALL_FILTER ? polls : polls.filter((poll) => poll.tag === filter);
  }, [polls, filter]);

  return (
    <div>
      {/* 자체 헤더 — 프로토타입 BalanceListScreen 상단 */}
      <header className="px-5 pb-3.5 pt-14">
        <h1 className="text-[28px] font-bold tracking-[-0.6px] text-ink">밸런스 게임</h1>
        <p className="mt-1.5 text-[13px] text-ink-mute">둘 중 하나만. 영혼을 걸 시간.</p>
      </header>

      {error ? (
        <EmptyState
          icon={Scale}
          title="리스트를 불러오지 못했어요"
          description={error.message}
        />
      ) : isPending ? (
        <BalanceListSkeleton />
      ) : (
        <>
          {/* 필터 pill 가로 스크롤 */}
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-5 pb-4">
            {filters.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setFilter(tag)}
                aria-pressed={filter === tag}
                aria-label={`${tag} 필터`}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full px-[9px] py-[5px] text-[11px] leading-none transition-colors duration-150 ease-otb",
                  filter === tag
                    ? "bg-ink font-medium text-white"
                    : "border border-hairline bg-transparent text-ink-mute",
                )}
              >
                {tag}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={Scale}
              title="아직 열린 밸런스 게임이 없어요"
              description="다른 태그를 골라보거나 잠시 후에 다시 와주세요."
            />
          ) : (
            <ul className="flex list-none flex-col gap-3.5 px-5">
              {filtered.map((poll: PollListItem) => {
                const sides = pickSides(poll.options);
                if (!sides) return null;
                return (
                  <li key={poll.id}>
                    <BalanceListCard poll={poll} a={sides.a} b={sides.b} />
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** 로딩 스켈레톤 — 필터 줄 + 카드 구조 유지 */
function BalanceListSkeleton() {
  return (
    <div>
      <div className="flex gap-1.5 px-5 pb-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[21px] w-14 rounded-full" />
        ))}
      </div>
      <div className="flex flex-col gap-3.5 px-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="overflow-hidden rounded-[14px] border border-hairline bg-canvas">
            <Skeleton className="h-[70px] rounded-none" />
            <div className="p-3.5">
              <div className="mb-2 flex gap-1.5">
                <Skeleton className="h-[21px] w-12 rounded-full" />
                <Skeleton className="h-[21px] w-10 rounded-full" />
              </div>
              <Skeleton className="mb-2 h-[15px] w-3/4" />
              <Skeleton className="h-1 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
