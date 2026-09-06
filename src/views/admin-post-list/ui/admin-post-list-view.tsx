"use client";

import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { formatCount, formatRelativeTime, useNowMs } from "@/shared/lib";
import { EmptyState, Pill, Skeleton, StaleBanner, buttonClassName } from "@/shared/ui";
import { useAdminPostListQuery } from "@/entities/post";
import { AdminFilterRail, AdminShell } from "@/widgets/admin-shell";

/**
 * 어드민 피드 목록.
 *
 * ⚠ 여기에는 **삭제·복구 버튼을 두지 않는다.** 글은 되돌릴 수 없는 조치가 여럿이라
 *   (이미지 제거·본문 가리기·삭제) 관리 화면에서 본문을 보고 결정해야 한다 —
 *   목록에서 바로 지우면 무엇을 지우는지 못 보고 누르게 된다.
 */
export function AdminPostListView({ deleted }: { deleted: boolean }) {
  const nowMs = useNowMs();
  const { data, isPending, error, refetch } = useAdminPostListQuery(deleted);

  return (
    <AdminShell>
      <h1 className="sr-only">피드 관리</h1>
      <AdminFilterRail basePath={ROUTES.adminPostList} deleted={deleted} />

      {isPending && (
        <div className="flex flex-col gap-2 px-5 pt-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {error && !data && (
        <EmptyState
          title="글을 불러오지 못했어요"
          description={error.message}
          onRetry={() => refetch()}
        />
      )}
      {error && data && <StaleBanner noun="글" onRetry={() => refetch()} />}

      {data && data.length === 0 && (
        <EmptyState
          icon={MessagesSquare}
          title={deleted ? "삭제된 글이 없어요" : "글이 없어요"}
        />
      )}

      {data && data.length > 0 && (
        <ul className="flex flex-col">
          {data.map((post) => (
            <li key={post.id} className="border-b border-hairline-cool px-5 py-3.5">
              <p className="flex items-center gap-1.5 text-[11px] text-ink-mute-2">
                <span className="font-mono tabular-nums">#{post.id}</span>
                <Pill variant="soft">{post.category}</Pill>
                {post.deletedAt !== null && <Pill variant="outline">삭제됨</Pill>}
              </p>
              {/* ⚠ 우회 삽입된 긴 제목이 행을 늘리지 않게 자른다(PostCard와 같은 이유) */}
              <p className="mt-1 line-clamp-2 text-[14px] font-medium leading-[1.45] text-ink">
                {post.title}
              </p>
              <p className="mt-1 line-clamp-1 text-[12px] text-ink-mute">{post.excerpt}</p>
              <div className="mt-2 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-mono text-[11px] tabular-nums text-ink-mute-2">
                  {post.authorNickname} · {formatRelativeTime(post.createdAt, nowMs)} · ♥
                  {formatCount(post.likeCount)} · 💬{formatCount(post.commentCount)}
                </p>
                <Link
                  href={ROUTES.adminPost(post.id)}
                  className={buttonClassName({ variant: "secondary", size: "sm" })}
                >
                  관리
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
