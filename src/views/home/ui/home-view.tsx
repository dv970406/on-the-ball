"use client";

import { CircleAlert } from "lucide-react";
import { AppBar } from "@/widgets/app-bar";
import { EmptyState, Skeleton } from "@/shared/ui";
import type { PollType } from "@/entities/poll";
import { useHomeQuery } from "../model/use-home-query";
import type { HomeFeed } from "../model/types";
import { HeroSection } from "./hero-section";
import { QuickPicks } from "./quick-picks";
import { QuizBanner } from "./quiz-banner";
import { OngoingPolls } from "./ongoing-polls";
import { TrendingList } from "./trending-list";
import { TmiPromo } from "./tmi-promo";

/** 트렌딩 행 링크용 — 홈 피드에 실린 폴들의 id → type 맵 */
function buildPollTypeMap(feed: HomeFeed): Map<string, PollType> {
  const map = new Map<string, PollType>();
  for (const poll of [feed.hero, ...feed.quickPicks, ...feed.ongoing]) {
    if (poll) map.set(poll.id, poll.type);
  }
  return map;
}

/** 홈 화면 — 히어로/캐러셀/퀴즈 배너/진행 중 투표/트렌딩/TMI 프로모 조립 피드 */
export function HomeView() {
  const { data, isPending, isError, error } = useHomeQuery();

  return (
    <div>
      <AppBar />
      {isPending ? (
        <HomeSkeleton />
      ) : isError ? (
        <EmptyState
          icon={CircleAlert}
          title="홈 피드를 불러오지 못했어요"
          description={error.message}
        />
      ) : (
        <div className="flex flex-col gap-8 pb-4">
          {data.hero ? <HeroSection poll={data.hero} /> : null}
          <QuickPicks polls={data.quickPicks} />
          {/* 오늘의 퀴즈가 없으면 섹션 자체를 숨긴다 */}
          {data.todayQuiz ? <QuizBanner quiz={data.todayQuiz} /> : null}
          <OngoingPolls polls={data.ongoing} />
          <TrendingList items={data.trending} pollTypeById={buildPollTypeMap(data)} />
          <TmiPromo />
        </div>
      )}
    </div>
  );
}

/** 로딩 스켈레톤 — 홈 섹션 구조(히어로/캐러셀/배너/리스트) 유지 */
function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-8 pb-4">
      {/* 히어로 */}
      <div className="px-5 pt-3.5">
        <Skeleton className="mb-2 h-2.5 w-20" />
        <Skeleton className="mb-2 h-[31px] w-3/4" />
        <Skeleton className="mb-3.5 h-[21px] w-44 rounded-full" />
        <Skeleton className="aspect-[4/5] rounded-[18px]" />
        <div className="mt-3.5 flex gap-2">
          <Skeleton className="h-11 flex-1 rounded-sm" />
          <Skeleton className="h-11 w-20 rounded-sm" />
        </div>
      </div>

      {/* 캐러셀 */}
      <div>
        <div className="px-5 pb-3">
          <Skeleton className="h-[23px] w-36" />
        </div>
        <div className="flex gap-3 overflow-hidden px-5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-60 shrink-0 overflow-hidden rounded-[14px] border border-hairline bg-canvas"
            >
              <Skeleton className="h-[110px] rounded-none" />
              <div className="p-3">
                <Skeleton className="mb-1.5 h-2.5 w-16" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 퀴즈 배너 */}
      <div className="px-5">
        <Skeleton className="h-64 rounded-xl" />
      </div>

      {/* 진행 중인 투표 */}
      <div>
        <div className="px-5 pb-3">
          <Skeleton className="h-[23px] w-32" />
        </div>
        <div className="flex flex-col gap-3 px-5">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </div>

      {/* 트렌딩 */}
      <div>
        <div className="px-5 pb-3">
          <Skeleton className="h-[23px] w-36" />
        </div>
        <div className="flex flex-col gap-2 px-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      </div>
    </div>
  );
}
