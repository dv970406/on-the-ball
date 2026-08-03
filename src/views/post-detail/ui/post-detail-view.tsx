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

  /**
   * ⚠ 에러 화면으로 갈아치우는 건 **보여줄 글이 없을 때뿐이다.**
   *   TanStack Query는 성공 후 리페치가 실패해도 data를 유지하는데, 조건 없이 error를 먼저
   *   보면 이미 읽고 있던 글이 통째로 사라진다 — 좋아요 한 번(onSettled 무효화)에
   *   네트워크가 잠깐 끊기면 본문이 날아가는 식이다.
   *   캐시가 있으면 그대로 보여주고, 실패는 아래 배너로만 알린다.
   */
  if (error && !post) {
    return (
      <>
        {header}
        <main>
          <EmptyState
            live
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
        {/* 캐시된 글은 그대로 두고 최신화 실패만 알린다 */}
        {error && (
          <p
            role="status"
            className="border-b border-hairline bg-canvas-soft px-5 py-2.5 text-[12px] text-ink-mute"
          >
            최신 내용을 불러오지 못했어요. 표시된 내용이 오래된 것일 수 있어요.
          </p>
        )}

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
