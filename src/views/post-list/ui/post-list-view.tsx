"use client";

import { useState } from "react";
import Link from "next/link";
import { PenLine } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { cn, formatCount } from "@/shared/lib";
import { Chip, EmptyState, Icon, useTabBarPresence } from "@/shared/ui";
import { TabScrollArea } from "@/widgets/tab-scroll-area";
import { AppBar } from "@/widgets/app-bar";
import { AuthStatus } from "@/widgets/auth-status";
import { BottomTabBar } from "@/widgets/bottom-tab-bar";
import {
  POST_CATEGORIES,
  POST_LIST_LIMIT,
  POST_SORTS,
  POST_SORT_LABEL,
  PostCard,
  useTodayPostCountQuery,
  usePostListQuery,
  type PostCategory,
  type PostSort,
} from "@/entities/post";
import { PostListSkeleton } from "./post-list-skeleton";

export function PostListView() {
  // 필터·정렬은 **로컬 state**다. URL 쿼리로 두면 useSearchParams가 이 화면의 프리렌더를
  // CSR로 떨어뜨린다(nextjs.md). 프로토타입도 화면 안 상태로 다룬다.
  const [category, setCategory] = useState<PostCategory | null>(null);
  const [sort, setSort] = useState<PostSort>("latest");

  const { data, isPending, isPlaceholderData, error, refetch } = usePostListQuery({
    category,
    sort,
  });
  const todayCount = useTodayPostCountQuery();

  // 토스트가 탭바에 가리지 않도록 이 화면이 떠 있는 동안만 위치를 올린다
  useTabBarPresence();

  const posts = data?.items;

  return (
    <>
      <TabScrollArea>
        {/* 세션 표시는 프로토타입에 없지만, 없으면 로그아웃 진입점이 앱에서 사라진다 — AppBar 주석 참고 */}
        <AppBar leading={<AuthStatus />} />

        <div className="px-5 pb-0.5 pt-[18px]">
          <h1 className="text-[26px] font-medium tracking-[-0.9px] text-ink">커뮤니티</h1>
          <p className="mt-1.5 text-[13px] text-ink-mute">
            오늘{" "}
            <span className="font-mono tabular-nums text-ink">
              {formatCount(todayCount.data ?? 0)}
            </span>
            개의 글이 올라왔어요
          </p>
        </div>

        {/* 말머리 레일 — 가로 스크롤, 스크롤바 숨김 */}
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-5 py-3">
          <Chip selected={category === null} onClick={() => setCategory(null)}>
            전체
          </Chip>
          {POST_CATEGORIES.map((item) => (
            <Chip
              key={item}
              selected={category === item}
              onClick={() => setCategory(item)}
            >
              {item}
            </Chip>
          ))}
        </div>

        {/* 정렬 행 + 현재 필터의 전체 건수 */}
        <div className="flex items-center gap-3.5 border-b border-hairline-cool px-5 pb-2.5 pt-0.5">
          {POST_SORTS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={sort === item}
              onClick={() => setSort(item)}
              className={cn(
                "py-1.5 text-[12px] transition-colors duration-150 ease-otb",
                sort === item ? "font-medium text-ink" : "text-ink-mute-2",
              )}
            >
              {POST_SORT_LABEL[item]}
            </button>
          ))}
          <span className="ml-auto font-mono text-[10px] tabular-nums tracking-[0.3px] text-ink-faint">
            {formatCount(data?.total ?? 0)} POSTS
          </span>
        </div>

        {isPending && <PostListSkeleton />}

        {/*
          ⚠ 에러 화면은 **보여줄 데이터가 없을 때만** 띄운다.
            TanStack Query는 성공 후 리페치가 실패해도 data를 유지하므로, 조건을 나누지 않으면
            "글을 불러오지 못했어요" 박스와 정상 목록이 한 화면에 공존한다(모순된 화면).
            앱의 다른 목록·상세도 같은 규약을 쓴다.
        */}
        {error && !posts && (
          <EmptyState
            live
            title="글을 불러오지 못했어요"
            description={error.message}
            onRetry={() => void refetch()}
          />
        )}

        {/* 캐시된 목록은 그대로 두고 최신화 실패만 알린다 (상세·수정·댓글과 같은 규약) */}
        {error && posts && (
          <p role="status" className="px-5 py-3 text-center text-[12px] text-ink-mute-2">
            최신 글을 불러오지 못했어요.{" "}
            <button
              type="button"
              onClick={() => void refetch()}
              className="underline underline-offset-2"
            >
              다시 시도
            </button>
          </p>
        )}

        {posts && posts.length === 0 && (
          <EmptyState
            icon={PenLine}
            title="아직 글이 없어요"
            description={
              category === null ? "첫 글을 남겨보세요." : `'${category}' 말머리의 글이 아직 없어요.`
            }
          />
        )}

        {posts && posts.length > 0 && (
          // 필터를 바꾸는 동안(placeholderData) 이전 목록이 남아 있다는 걸 은은하게 알린다.
          // 스켈레톤으로 갈아치우면 레이아웃이 튄다.
          <ul className={cn("transition-opacity duration-150 ease-otb", isPlaceholderData && "opacity-50")}>
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </ul>
        )}

        {/*
          잘림 안내 — 댓글 목록과 같은 규칙이다. 없으면 31번째 글부터는 화면에서 사라진 채
          사용자에게 아무 단서도 남지 않는다.
          ⚠ 판정은 **응답 길이만으로** 한다. data.total(서버 카운트)과 비교하면
            리페치 시점 차이로 잘못 뜬다 — total은 `N POSTS` 라벨 전용이다.
        */}
        {posts && posts.length >= POST_LIST_LIMIT && (
          <p className="px-5 pt-3 text-center text-[12px] text-ink-mute-2">
            최근 {formatCount(POST_LIST_LIMIT)}개만 표시하고 있어요.
          </p>
        )}

        {posts && posts.length > 0 && posts.length < POST_LIST_LIMIT && (
          <p className="px-5 pb-2 pt-7 text-center font-mono text-[10px] tracking-[0.4px] text-ink-faint">
            END OF FEED
          </p>
        )}
      </TabScrollArea>

      {/*
        플로팅 글쓰기 버튼 — **잉크 블랙**이다. 목록 화면의 컬러 이벤트는 0개다.
        알약 형태는 "버튼 6px 라운드" 규칙의 명시적 예외 4곳 중 하나.
        Link 안에 Button을 넣지 않는다(<a> 안의 <button>) — 클래스만 재현한다.
      */}
      <Link
        href={ROUTES.postNew}
        className="absolute bottom-[100px] right-4 z-[66] inline-flex h-11 items-center gap-1.5 rounded-full bg-ink pl-[13px] pr-4 text-sm font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
      >
        <Icon as={PenLine} size={16} />
        글쓰기
      </Link>

      <BottomTabBar />
    </>
  );
}
