"use client";

import Link from "next/link";
import { MessageSquare, Pencil } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { formatCount, formatRelativeTime } from "@/shared/lib";
import { EmptyState, Icon, Markdown, Skeleton } from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";
import { isEdited, usePostQuery } from "@/entities/post";
import { useSessionStore } from "@/entities/session";
import { DeletePostButton } from "@/features/delete-post";
import { LikeButton } from "@/features/toggle-post-like";
import { CommentSection } from "./comment-section";

export function PostDetailView({ postId }: { postId: number }) {
  const { data: post, isPending, error, refetch } = usePostQuery(postId);
  const user = useSessionStore((s) => s.user);

  const header = <SubHeader title="게시글" fallbackHref={ROUTES.postList} />;

  if (isPending) {
    return (
      <>
        {header}
        <main className="flex flex-col gap-3 px-5 py-6">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="mt-3 h-40 w-full" />
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        {header}
        <main>
          <EmptyState
            title="글을 불러오지 못했어요"
            description={error.message}
            onRetry={() => void refetch()}
          />
        </main>
      </>
    );
  }

  if (!post) {
    return (
      <>
        {header}
        <main>
          <EmptyState title="글을 찾을 수 없어요" description="삭제되었거나 없는 글이에요." />
        </main>
      </>
    );
  }

  const isMine = post.authorId === user?.id;

  return (
    <>
      {header}
      <main className="h-full overflow-y-auto pb-[max(24px,env(safe-area-inset-bottom))]">
        {/* 독립 콘텐츠라 article + header/footer */}
        <article className="px-5 py-6">
          <header>
            <h1 className="text-[22px] font-bold leading-[1.4] tracking-[-0.5px] text-ink">
              {post.title}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-mute-2">
              <span className="text-ink-mute">{post.authorNickname}</span>
              <span aria-hidden>·</span>
              <time dateTime={post.createdAt}>{formatRelativeTime(post.createdAt)}</time>
              {isEdited(post) && (
                <>
                  <span aria-hidden>·</span>
                  <span>수정됨</span>
                </>
              )}
            </p>
          </header>

          <div className="mt-5 border-t border-hairline-cool pt-5">
            <Markdown>{post.content}</Markdown>
          </div>

          <footer className="mt-6 flex items-center gap-4 border-t border-hairline-cool pt-4 text-[13px] text-ink-mute">
            <LikeButton postId={post.id} likeCount={post.likeCount} isLiked={post.isLiked} />
            <span className="flex items-center gap-1.5">
              <Icon as={MessageSquare} size={15} />
              <span className="tnum">{formatCount(post.commentCount)}</span>
              <span className="sr-only">댓글</span>
            </span>

            {isMine && (
              <span className="ml-auto flex items-center gap-3">
                <Link
                  href={ROUTES.postEdit(post.id)}
                  className="flex items-center gap-1 text-[13px] text-ink-mute"
                >
                  <Icon as={Pencil} size={14} />
                  수정
                </Link>
                <DeletePostButton postId={post.id} />
              </span>
            )}
          </footer>
        </article>

        <CommentSection postId={post.id} commentCount={post.commentCount} />
      </main>
    </>
  );
}
