"use client";

import Link from "next/link";
import { PenLine } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { EmptyState, TabHeader, buttonClassName } from "@/shared/ui";
import { TabScrollArea } from "@/widgets/tab-scroll-area";
import { AuthStatus } from "@/widgets/auth-status";
import { PostCard, usePostListQuery } from "@/entities/post";
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
          <PenLine size={14} aria-hidden />
          글쓰기
        </Link>
      </div>

      {isPending && <PostListSkeleton />}

      {error && (
        <EmptyState
          title="글을 불러오지 못했어요"
          description={error.message}
          onRetry={() => void refetch()}
        />
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
    </TabScrollArea>
  );
}
