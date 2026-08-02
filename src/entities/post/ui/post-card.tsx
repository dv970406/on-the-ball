"use client";

import Link from "next/link";
import { Heart, MessageSquare } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { cn, formatCount, formatRelativeTime } from "@/shared/lib";
import { Icon } from "@/shared/ui";
import { isEdited } from "../api/mappers";
import type { PostListItem } from "../model/types";

/**
 * 목록의 게시글 한 줄.
 *
 * 링크로 감싼 리스트 행이므로 article 래퍼 없이 li만 쓴다.
 * 제목은 페이지 h1(TabHeader) 바로 아래 계층이라 h2.
 *
 * ⚠ formatRelativeTime은 내부에서 Date.now()를 쓴다. 목록은 클라이언트 쿼리로만 그려서
 *   SSR HTML이 항상 스켈레톤이라 안전하다 — 나중에 서버 프리페치를 붙이면
 *   응답에 서버 기준 시각을 실어야 한다.
 */
export function PostCard({ post }: { post: PostListItem }) {
  return (
    <li className="card">
      <Link href={ROUTES.post(post.id)} className="block px-4 py-4">
        <h2 className="text-[16px] font-semibold leading-[1.45] tracking-[-0.2px] text-ink">
          {post.title}
        </h2>

        <footer className="mt-2.5 flex items-center gap-2 text-[12px] text-ink-mute-2">
          <span className="truncate text-ink-mute">{post.authorNickname}</span>
          <span aria-hidden>·</span>
          <time dateTime={post.createdAt}>{formatRelativeTime(post.createdAt)}</time>
          {isEdited(post) && (
            <>
              <span aria-hidden>·</span>
              <span>수정됨</span>
            </>
          )}

          <span className="ml-auto flex items-center gap-3">
            {/* 목록에서는 좋아요를 잉크 래더로만 표현한다 — 이 화면의 컬러 이벤트는 글쓰기 버튼 하나 */}
            <span className={cn("flex items-center gap-1", post.isLiked && "text-ink")}>
              <Icon as={Heart} size={13} className={post.isLiked ? "fill-current" : undefined} />
              <span className="tnum">{formatCount(post.likeCount)}</span>
              <span className="sr-only">좋아요</span>
            </span>
            <span className="flex items-center gap-1">
              <Icon as={MessageSquare} size={13} />
              <span className="tnum">{formatCount(post.commentCount)}</span>
              <span className="sr-only">댓글</span>
            </span>
          </span>
        </footer>
      </Link>
    </li>
  );
}
