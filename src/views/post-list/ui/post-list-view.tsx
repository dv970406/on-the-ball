"use client";

import Link from "next/link";
import { PenLine } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { formatCount } from "@/shared/lib";
import { EmptyState, Icon, TabHeader, buttonClassName } from "@/shared/ui";
import { TabScrollArea } from "@/widgets/tab-scroll-area";
import { AuthStatus } from "@/widgets/auth-status";
import { POST_LIST_LIMIT, PostCard, usePostListQuery } from "@/entities/post";
import { PostListSkeleton } from "./post-list-skeleton";

export function PostListView() {
  const { data: posts, isPending, error, refetch } = usePostListQuery();

  return (
    <TabScrollArea>
      <TabHeader title="게시판" subtitle="자유롭게 글을 쓰고 이야기를 나눠보세요." />

      <div className="flex items-center justify-between gap-3 px-5 pb-4">
        <AuthStatus />
        {/* 이 화면의 유일한 컬러 이벤트 */}
        <Link href={ROUTES.postNew} className={buttonClassName({ size: "sm" })}>
          {/* 아이콘은 반드시 Icon 래퍼로 — 직접 쓰면 lucide 기본 strokeWidth(2)라 굵기가 튄다 */}
          <Icon as={PenLine} size={14} />
          글쓰기
        </Link>
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
        <p role="status" className="px-5 pb-3 text-center text-[12px] text-ink-mute-2">
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
          description="첫 글을 남겨보세요."
        />
      )}

      {posts && posts.length > 0 && (
        <ul className="flex flex-col gap-2.5 px-5">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </ul>
      )}

      {/*
        잘림 안내 — 댓글 목록과 같은 규칙이다. 없으면 31번째 글부터는 화면에서 사라진 채
        사용자에게 아무 단서도 남지 않는다. (판정은 응답 길이만으로 한다 — 서버 카운트와
        비교하면 리페치 시점 차이로 잘못 뜬다)
      */}
      {posts && posts.length >= POST_LIST_LIMIT && (
        <p className="px-5 pt-3 text-center text-[12px] text-ink-mute-2">
          최근 {formatCount(POST_LIST_LIMIT)}개만 표시하고 있어요.
        </p>
      )}
    </TabScrollArea>
  );
}
